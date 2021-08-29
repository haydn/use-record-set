import {
  DocumentNode,
  ExecutionResult,
  GraphQLBoolean,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  execute,
} from "graphql";
import { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import { toBase64, fromBase64 } from "js-base64";

export type Record = {
  type: string;
  id: string;
  [key: string]: string | number | boolean | Array<string>;
};

export type Schema = {
  [key: string]: {
    meta: {
      singular: string;
      plural: string;
    };
    fields: {
      [key: string]: SchemaField;
    };
  };
};

export type SchemaField =
  | {
      type: "String";
      // init?: () => string;
    }
  | {
      type: "Number";
      // init?: () => number;
    }
  | {
      type: "Boolean";
      // init?: () => boolean;
    }
  | {
      type: "Date";
      // init?: () => string;
    }
  | {
      type: "ForeignKey";
      cardinality: "oneToOne" | "oneToMany" | "manyToMany" | "manyToOne";
    }
  | {
      type: "Inverse";
      // FIXME: These types could probably be constrained somehow…
      source:
        | {
            type: string;
            field: string;
          }
        | Array<{
            type: string;
            field: string;
          }>;
    };

export type Config = {
  init: Array<Record>;
  persistence: Persistence | null;
};

interface Persistence {
  load(): Array<Record> | null;
  save(records: Array<Record>): void;
}

const FIELD_TYPE_MAP = {
  Boolean: GraphQLBoolean,
  String: GraphQLString,
  Number: GraphQLFloat,
  Date: GraphQLString,
};

const DEFAULT_CONFIG: Config = {
  init: [],
  persistence: null,
};

class RecordSet extends EventTarget {
  private config: Config;
  private records: Array<Record>;

  public schema: GraphQLSchema;

  constructor(schema: Schema, config?: Partial<Config>) {
    super();

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.records = this.config.init;

    if (this.config.persistence) {
      const loadedRecords = this.config.persistence.load();
      if (loadedRecords !== null) {
        this.records = loadedRecords;
      }
      this.addEventListener("change", this.updatePersistence);
    }

    this.schema = this.generateSchema(schema);
  }

  public query(query: DocumentNode, variables = {}) {
    const { data, errors } = execute(this.schema, query, null, null, variables) as ExecutionResult;
    if (Array.isArray(errors)) {
      for (let error of errors) {
        console.log(error);
      }
    }
    return data;
  }

  private updatePersistence() {
    if (this.config.persistence) {
      this.config.persistence.save(this.records);
    }
  }

  private generateSchema(schema: Schema): GraphQLSchema {
    const dynamicTypes: { [key: string]: GraphQLObjectType } = {};
    const dynamicQueryFields: GraphQLFieldConfigMap<null, null> = {};
    const dynamicMutationFields: GraphQLFieldConfigMap<null, null> = {};

    const NodeType = new GraphQLInterfaceType({
      name: "Node",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolveType: (value) => dynamicTypes[value.type],
    });

    const RelationshipType = new GraphQLObjectType({
      name: "Relationship",
      fields: {
        source: { type: NodeType },
        target: { type: NodeType },
      },
    });

    const ForeignKeyInputType = new GraphQLInputObjectType({
      name: "ForeignKeyInput",
      fields: {
        type: { type: new GraphQLNonNull(GraphQLString) },
        field: { type: new GraphQLNonNull(GraphQLString) },
      },
    });

    for (let type in schema) {
      const fields = () => {
        const result: GraphQLFieldConfigMap<Record, null> = {
          id: {
            type: new GraphQLNonNull(GraphQLString),
          },
        };

        for (let field in schema[type].fields) {
          const f = schema[type].fields[field];
          switch (f.type) {
            case "ForeignKey": {
              if (f.cardinality === "manyToMany" || f.cardinality === "oneToMany") {
                result[field] = {
                  type: new GraphQLNonNull(new GraphQLList(NodeType)),
                  resolve: (record: Record) => {
                    const source = record[field];
                    return Array.isArray(source)
                      ? source.map((id) => this.records.find((r) => r.id === id))
                      : [];
                  },
                };
              } else {
                result[field] = {
                  type: NodeType,
                  resolve: (record: Record) => this.records.find((r) => r.id === record[field]),
                };
              }
              break;
            }
            case "Inverse": {
              const source = f.source;
              if (Array.isArray(source)) {
                result[field] = {
                  type: new GraphQLNonNull(new GraphQLList(NodeType)),
                  resolve: (obj) =>
                    source.reduce<Array<Record>>((result, { type, field }) => {
                      const inverse = schema[type].fields[field];
                      if (inverse.type !== "ForeignKey") {
                        throw Error(`Expected ${type}#${field} to be a foreign key.`);
                      }
                      switch (inverse.cardinality) {
                        case "manyToMany": {
                          return [
                            ...result,
                            ...resolveInverseManyToMany(this.records, field, obj.id).filter(
                              (inverseRecord) => !result.find(({ id }) => id === inverseRecord.id),
                            ),
                          ];
                        }
                        case "manyToOne": {
                          return [
                            ...result,
                            ...resolveInverseManyToOne(this.records, field, obj.id).filter(
                              (inverseRecord) => !result.find(({ id }) => id === inverseRecord.id),
                            ),
                          ];
                        }
                        case "oneToOne": {
                          const inverseRecord = resolveInverseOneToOne(this.records, field, obj.id);
                          return inverseRecord === undefined ||
                            result.find(({ id }) => id === inverseRecord.id)
                            ? result
                            : [...result, inverseRecord];
                        }
                        case "oneToMany": {
                          const inverseRecord = resolveInverseOneToMany(
                            this.records,
                            field,
                            obj.id,
                          );
                          return inverseRecord === undefined ||
                            result.find(({ id }) => id === inverseRecord.id)
                            ? result
                            : [...result, inverseRecord];
                        }
                      }
                    }, []),
                };
              } else {
                const inverse = schema[source.type].fields[source.field];
                if (inverse.type !== "ForeignKey") {
                  throw Error(`Expected ${source.type}#${source.field} to be a foreign key.`);
                }
                switch (inverse.cardinality) {
                  case "manyToMany": {
                    result[field] = {
                      type: new GraphQLNonNull(new GraphQLList(NodeType)),
                      resolve: (obj) =>
                        resolveInverseManyToMany(this.records, source.field, obj.id),
                    };
                    break;
                  }
                  case "manyToOne": {
                    result[field] = {
                      type: new GraphQLNonNull(new GraphQLList(NodeType)),
                      resolve: (obj) => resolveInverseManyToOne(this.records, source.field, obj.id),
                    };
                    break;
                  }
                  case "oneToOne": {
                    result[field] = {
                      type: NodeType,
                      resolve: (obj) => resolveInverseOneToOne(this.records, source.field, obj.id),
                    };
                    break;
                  }
                  case "oneToMany": {
                    result[field] = {
                      type: NodeType,
                      resolve: (obj) => resolveInverseOneToMany(this.records, source.field, obj.id),
                    };
                    break;
                  }
                }
              }
              break;
            }
            default: {
              result[field] = {
                type: FIELD_TYPE_MAP[f.type],
              };
              break;
            }
          }
        }

        return result;
      };

      dynamicTypes[type] = new GraphQLObjectType({
        name: type,
        interfaces: [NodeType],
        fields,
      });
    }

    for (let type in schema) {
      dynamicQueryFields[schema[type].meta.singular] = {
        type: dynamicTypes[type],
        args: {
          id: {
            type: new GraphQLNonNull(GraphQLString),
          },
        },
        resolve: (_, { id }) => this.records.find((record) => record.id === id),
      };
      dynamicQueryFields[schema[type].meta.plural] = {
        type: new GraphQLNonNull(new GraphQLList(dynamicTypes[type])),
        args: {
          ids: {
            type: new GraphQLList(new GraphQLNonNull(GraphQLString)),
          },
        },
        resolve: (_, { ids }) =>
          Array.isArray(ids)
            ? ids.map((id) => this.records.find((record) => record.id === id))
            : this.records.filter((record) => record.type === type),
      };
      dynamicMutationFields[`create${type}`] = {
        type: dynamicTypes[type],
        args: {
          id: {
            type: GraphQLString,
          },
          ...Object.entries(schema[type].fields).reduce(
            (result, [name, field]) =>
              field.type === "ForeignKey" || field.type === "Inverse"
                ? result
                : {
                    ...result,
                    [name]: {
                      type: FIELD_TYPE_MAP[field.type],
                    },
                  },
            {},
          ),
        },
        resolve: (_, args) => {
          const createdRecord = {
            type,
            id: uuid(),
            ...args,
          };
          this.records.push(createdRecord);
          this.dispatchEvent(new Event("change"));
          return createdRecord;
        },
      };
      dynamicMutationFields[`update${type}`] = {
        type: dynamicTypes[type],
        args: {
          id: {
            type: new GraphQLNonNull(GraphQLString),
          },
          ...Object.entries(schema[type].fields).reduce(
            (result, [name, field]) =>
              field.type === "ForeignKey" || field.type === "Inverse"
                ? result
                : {
                    ...result,
                    [name]: {
                      type: FIELD_TYPE_MAP[field.type],
                    },
                  },
            {},
          ),
        },
        resolve: (_, { id, ...args }) => {
          const updatedRecord = this.records.find((record) => record.id === id);
          if (updatedRecord) {
            for (let arg in args) {
              updatedRecord[arg] = args[arg];
            }
          }
          this.dispatchEvent(new Event("change"));
          return updatedRecord;
        },
      };
      dynamicMutationFields[`delete${type}`] = {
        type: dynamicTypes[type],
        args: {
          id: {
            type: new GraphQLNonNull(GraphQLString),
          },
        },
        resolve: (_, { id }) => {
          const deletedRecord = this.records.find((record) => record.id === id);
          this.records = this.records.filter((record) => record.id !== id);
          this.dispatchEvent(new Event("change"));
          return deletedRecord;
        },
      };
    }

    const QueryType = new GraphQLObjectType({
      name: "RootQueryType",
      fields: {
        relationships: {
          type: new GraphQLList(RelationshipType),
          args: {
            foreignKeys: {
              type: new GraphQLList(ForeignKeyInputType),
            },
          },
          resolve: () => {
            const result = [];
            for (let type in schema) {
              for (let field in schema[type].fields) {
                const f = schema[type].fields[field];
                if (f.type === "ForeignKey") {
                  const records = this.records.filter((record) => record.type === type);
                  for (let record of records) {
                    if (record[field]) {
                      if (f.cardinality === "manyToMany" || f.cardinality === "manyToOne") {
                        const relations = record[field];
                        if (Array.isArray(relations)) {
                          for (let relation of relations) {
                            result.push({ source: { id: record.id }, target: { id: relation } });
                          }
                        }
                      } else {
                        result.push({ source: { id: record.id }, target: { id: record[field] } });
                      }
                    }
                  }
                }
              }
            }
            return result;
          },
        },
        ...dynamicQueryFields,
      },
    });

    const MutationType = new GraphQLObjectType({
      name: "RootMutationType",
      fields: {
        addRelationship: {
          type: NodeType,
          args: {
            field: {
              type: new GraphQLNonNull(GraphQLString),
            },
            source: {
              type: new GraphQLNonNull(GraphQLString),
            },
            target: {
              type: new GraphQLNonNull(GraphQLString),
            },
          },
          resolve: (_, { field, source, target }) => {
            const sourceRecord = this.records.find(({ id }) => id === source);
            if (!sourceRecord) {
              throw Error(`Cannot find record ${source}.`);
            }
            const f = schema[sourceRecord.type].fields[field];
            if (f.type !== "ForeignKey") {
              throw Error(
                `Unable to add relationship: ${field} on ${sourceRecord.type} in not a foreign key.`,
              );
            }
            if (f.cardinality === "manyToMany" || f.cardinality === "oneToMany") {
              if (f.cardinality === "oneToMany") {
                for (let record of this.records) {
                  if (record.type === sourceRecord.type) {
                    const current = record[field];
                    if (Array.isArray(current)) {
                      record[field] = current.filter((x) => x !== target);
                    }
                  }
                }
              }
              const current = sourceRecord[field];
              const currentArray = Array.isArray(current) ? current : [];
              sourceRecord[field] = currentArray.includes(target)
                ? currentArray
                : [...currentArray, target];
            } else {
              if (f.cardinality === "oneToOne") {
                for (let record of this.records) {
                  if (record.type === sourceRecord.type && record[field] === target) {
                    delete record[field];
                  }
                }
              }
              sourceRecord[field] = target;
            }
            this.dispatchEvent(new Event("change"));
            return sourceRecord;
          },
        },
        removeRelationship: {
          type: NodeType,
          args: {
            field: {
              type: new GraphQLNonNull(GraphQLString),
            },
            source: {
              type: new GraphQLNonNull(GraphQLString),
            },
            target: {
              type: new GraphQLNonNull(GraphQLString),
            },
          },
          resolve: (_, { field, source, target }) => {
            const sourceRecord = this.records.find(({ id }) => id === source);
            if (!sourceRecord) {
              throw Error(`Cannot find record ${source}.`);
            }
            const f = schema[sourceRecord.type].fields[field];
            if (f.type !== "ForeignKey") {
              throw Error(
                `Unable to remove relationship: ${field} on ${sourceRecord.type} in not a foreign key.`,
              );
            }
            if (f.cardinality === "manyToMany" || f.cardinality === "oneToMany") {
              const current = sourceRecord[field];
              const currentArray = Array.isArray(current) ? current : [];
              sourceRecord[field] = currentArray.filter((id) => id !== target);
            } else {
              delete sourceRecord[field];
            }
            this.dispatchEvent(new Event("change"));
            return sourceRecord;
          },
        },
        ...dynamicMutationFields,
      },
    });

    return new GraphQLSchema({
      query: QueryType,
      mutation: MutationType,
    });
  }
}

class LocalStoragePersistence implements Persistence {
  private key: string;

  constructor(key: string = "recordSet") {
    this.key = key;
  }

  load(): Array<Record> | null {
    const value = window.localStorage.getItem(this.key);
    return value ? JSON.parse(value) : null;
  }

  save(records: Array<Record>): void {
    window.localStorage.setItem(this.key, JSON.stringify(records));
  }
}

class UrlPersistence implements Persistence {
  load(): Array<Record> | null {
    let persistedRecords = null;
    const hash = window.location.hash.slice(1).trim();

    if (hash.length > 0) {
      try {
        persistedRecords = JSON.parse(fromBase64(hash)) as unknown;
      } catch (error) {
        console.log(error);
      }
    }

    return persistedRecords && isRecordSet(persistedRecords) ? persistedRecords : [];
  }

  save(records: Array<Record>): void {
    history.replaceState(undefined, "", `#${toBase64(JSON.stringify(records), true)}`);
  }
}

const isRecord = (value: any): value is Record =>
  typeof value === "object" && typeof value.type === "string" && typeof value.id === "string";

const isRecordSet = (value: any): value is Array<Record> =>
  Array.isArray(value) && value.every((record) => isRecord(record));

const resolveInverseManyToMany = (records: Array<Record>, field: string, id: string) =>
  records.filter((record) => {
    const f = record[field];
    return Array.isArray(f) ? f.includes(id) : false;
  });

const resolveInverseManyToOne = (records: Array<Record>, field: string, id: string) =>
  records.filter((record) => record[field] === id);

const resolveInverseOneToOne = (records: Array<Record>, field: string, id: string) =>
  records.find((record) => record[field] === id);

const resolveInverseOneToMany = (records: Array<Record>, field: string, id: string) =>
  records.find((record) => {
    const x = record[field];
    return Array.isArray(x) ? x.includes(id) : false;
  });

const createRecordSet = (
  schema: Schema,
  config?: Partial<{
    init: Array<Record>;
    persistence: "url" | "localStorage";
    localStorageKey: string;
  }>,
) => {
  let persistence = null;

  switch (config?.persistence) {
    case "localStorage": {
      persistence = new LocalStoragePersistence(config?.localStorageKey);
      break;
    }
    case "url": {
      persistence = new UrlPersistence();
      break;
    }
  }

  const recordSet = new RecordSet(schema, {
    init: config?.init,
    persistence,
  });

  return {
    recordSet,
    useRecordSet: (query: DocumentNode, variables = {}) => {
      const [, setTick] = useState(0);

      useEffect(() => {
        const changeHandler = () => {
          setTick((x) => x + 1);
        };
        recordSet.addEventListener("change", changeHandler);
        return () => {
          recordSet.removeEventListener("change", changeHandler);
        };
      });

      return recordSet.query(query, variables);
    },
    updateRecordSet: (query: DocumentNode, variables = {}) => recordSet.query(query, variables),
  };
};

const StringField = (): { type: "String" } => ({ type: "String" });

const NumberField = (): { type: "Number" } => ({ type: "Number" });

const BooleanField = (): { type: "Boolean" } => ({ type: "Boolean" });

const DateField = (): { type: "Date" } => ({ type: "Date" });

const ForeignKeyField = (
  cardinality: "oneToOne" | "oneToMany" | "manyToMany" | "manyToOne",
): { type: "ForeignKey"; cardinality: "oneToOne" | "oneToMany" | "manyToMany" | "manyToOne" } => ({
  type: "ForeignKey",
  cardinality,
});

const InverseField = (
  source: String | Array<String>,
): {
  type: "Inverse";
  source:
    | {
        type: string;
        field: string;
      }
    | Array<{
        type: string;
        field: string;
      }>;
} => {
  if (Array.isArray(source)) {
    return {
      type: "Inverse",
      source: source.map((s) => {
        const [type, field] = s.split("#");
        return { type, field };
      }),
    };
  } else {
    const [type, field] = source.split("#");
    return { type: "Inverse", source: { type, field } };
  }
};

export {
  RecordSet,
  UrlPersistence,
  LocalStoragePersistence,
  createRecordSet,
  StringField,
  NumberField,
  BooleanField,
  DateField,
  ForeignKeyField,
  InverseField,
};
