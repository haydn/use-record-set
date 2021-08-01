import {
  DocumentNode,
  execute,
  ExecutionResult,
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLFieldConfigMap,
} from "graphql";
import { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";

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

type SchemaField =
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
      type: "InverseRelation";
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
  persistence: "none" | "url" | "localStorage";
  localStorageKey: string;
};

const FIELD_TYPE_MAP = {
  Boolean: GraphQLBoolean,
  String: GraphQLString,
  Number: GraphQLFloat,
  Date: GraphQLString,
};

const DEFAULT_CONFIG: Config = {
  init: [],
  persistence: "none",
  localStorageKey: "recordSet",
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

    switch (this.config.persistence) {
      case "none": {
        this.records = this.config.init;
        break;
      }
      case "url": {
        this.loadUrl();
        this.addEventListener("change", this.updateUrl);
        break;
      }
      case "localStorage": {
        this.loadLocalStorage();
        this.addEventListener("change", this.updateLocalStorage);
        break;
      }
      default: {
        throw Error(
          `Unknown persistence type "${this.config.persistence}". Where you after "url" or "localStorage"?`,
        );
      }
    }

    this.generateSchema(schema);
  }

  public query(query: DocumentNode, variables: {}) {
    const { data } = execute(this.schema, query, null, variables) as ExecutionResult;
    return data;
  }

  private loadUrl() {
    // TODO: Load from the URL if there's anything there.
    this.records = this.config.init;
  }

  private updateUrl() {
    // TODO
  }

  private loadLocalStorage() {
    // TODO: Load from local storage if there's anything there.
    this.records = this.config.init;
  }

  private updateLocalStorage() {
    // TODO
  }

  private generateSchema(schema: Schema) {
    const dynamicTypes = {};
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
            case "InverseRelation": {
              const source = f.source;
              if (Array.isArray(source)) {
                result[field] = {
                  type: new GraphQLNonNull(new GraphQLList(NodeType)),
                  resolve: (obj) =>
                    source.reduce((result, { type, field }) => {
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
                          return result.find(({ id }) => id === inverseRecord.id)
                            ? result
                            : [...result, inverseRecord];
                        }
                        case "oneToMany": {
                          const inverseRecord = resolveInverseOneToMany(
                            this.records,
                            field,
                            obj.id,
                          );
                          return result.find(({ id }) => id === inverseRecord.id)
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
            : [],
      };
      dynamicMutationFields[`create${type}`] = {
        type: dynamicTypes[type],
        args: {
          id: {
            type: GraphQLString,
          },
          ...Object.entries(schema[type].fields).reduce(
            (result, [name, field]) =>
              field.type === "ForeignKey" || field.type === "InverseRelation"
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
              field.type === "ForeignKey" || field.type === "InverseRelation"
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
          for (let arg in args) updatedRecord[arg] = args[arg];
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
              const current = sourceRecord[field];
              const currentArray = Array.isArray(current) ? current : [];
              sourceRecord[field] = currentArray.includes(target)
                ? currentArray
                : [...currentArray, target];
            } else {
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
              sourceRecord[field] = undefined;
            }
            this.dispatchEvent(new Event("change"));
            return sourceRecord;
          },
        },
        ...dynamicMutationFields,
      },
    });

    this.schema = new GraphQLSchema({
      query: QueryType,
      mutation: MutationType,
    });
  }
}

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

const useRecordSet = (
  recordSet: RecordSet,
  query: DocumentNode,
  variables: { [key: string]: any },
) => {
  const [result, updateResult] = useState<ExecutionResult>(recordSet.query(query, variables));

  useEffect(() => {
    const changeHandler = () => {
      updateResult(recordSet.query(query, variables));
    };
    recordSet.addEventListener("change", changeHandler);
    return () => {
      recordSet.removeEventListener("change", changeHandler);
    };
  }, []);

  return result;
};

const createRecordSet = (schema: Schema, config?: Partial<Config>) => {
  const recordSet = new RecordSet(schema, config);
  return {
    recordSet,
    useRecordSet: (query: DocumentNode, variables: { [key: string]: any }) =>
      useRecordSet(recordSet, query, variables),
    updateRecordSet: (query: DocumentNode, variables: { [key: string]: any }) =>
      recordSet.query(query, variables),
  };
};

export { RecordSet, useRecordSet, createRecordSet };
