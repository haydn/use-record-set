import { act, renderHook } from "@testing-library/react";
import dedent from "dedent";
import { execute, printSchema } from "graphql";
import gql from "graphql-tag";
import { fromBase64, toBase64 } from "js-base64";
import {
  BooleanField,
  DateField,
  ForeignKeyField,
  InverseField,
  LocalStoragePersistence,
  NumberField,
  RecordSet,
  Schema,
  StringField,
  UrlPersistence,
  createRecordSet,
} from "./index.js";

const nodeOnlyTest = typeof window === "object" ? test.skip : test;
const browserOnlyTest = typeof window === "object" ? test : test.skip;

const MINIMAL_SCHEMA: Schema = {
  Record: {
    meta: {
      singular: "record",
      plural: "records",
    },
    fields: {},
  },
};

const SCALAR_FIELDS_SCHEMA: Schema = {
  Record: {
    meta: {
      singular: "record",
      plural: "records",
    },
    fields: {
      string: {
        type: "String",
      },
      number: {
        type: "Number",
      },
      boolean: {
        type: "Boolean",
      },
      date: {
        type: "Date",
      },
    },
  },
};

const FOREIGN_KEYS_SCHEMA: Schema = {
  Record: {
    meta: {
      singular: "record",
      plural: "records",
    },
    fields: {
      manyToMany: {
        type: "ForeignKey",
        cardinality: "manyToMany",
      },
      manyToOne: {
        type: "ForeignKey",
        cardinality: "manyToOne",
      },
      oneToOne: {
        type: "ForeignKey",
        cardinality: "oneToOne",
      },
      oneToMany: {
        type: "ForeignKey",
        cardinality: "oneToMany",
      },
    },
  },
};

const INVERSE_RELATIONS_SCHEMA: Schema = {
  Record: {
    meta: {
      singular: "record",
      plural: "records",
    },
    fields: {
      manyToMany: {
        type: "ForeignKey",
        cardinality: "manyToMany",
      },
      manyToOne: {
        type: "ForeignKey",
        cardinality: "manyToOne",
      },
      oneToOne: {
        type: "ForeignKey",
        cardinality: "oneToOne",
      },
      oneToMany: {
        type: "ForeignKey",
        cardinality: "oneToMany",
      },
      inverseManyToMany: {
        type: "Inverse",
        source: {
          type: "Record",
          field: "manyToMany",
        },
      },
      inverseManyToOne: {
        type: "Inverse",
        source: {
          type: "Record",
          field: "manyToOne",
        },
      },
      inverseOneToOne: {
        type: "Inverse",
        source: {
          type: "Record",
          field: "oneToOne",
        },
      },
      inverseOneToMany: {
        type: "Inverse",
        source: {
          type: "Record",
          field: "oneToMany",
        },
      },
      inverseMultiple: {
        type: "Inverse",
        source: [
          {
            type: "Record",
            field: "manyToMany",
          },
          {
            type: "Record",
            field: "manyToOne",
          },
          {
            type: "Record",
            field: "oneToOne",
          },
          {
            type: "Record",
            field: "oneToMany",
          },
        ],
      },
    },
  },
};

const COMPLEX_SCHEMA: Schema = {
  Role: {
    meta: {
      singular: "role",
      plural: "roles",
    },
    fields: {
      lineManager: {
        type: "ForeignKey",
        cardinality: "manyToOne",
      },
      responsibilities: {
        type: "ForeignKey",
        cardinality: "oneToMany",
      },
      holder: {
        type: "ForeignKey",
        cardinality: "oneToOne",
      },
      teams: {
        type: "ForeignKey",
        cardinality: "manyToMany",
      },
      reports: {
        type: "Inverse",
        source: {
          type: "Role",
          field: "lineManager",
        },
      },
    },
  },
  Responsibility: {
    meta: {
      singular: "responsibility",
      plural: "responsibilities",
    },
    fields: {
      owner: {
        type: "Inverse",
        source: {
          type: "Role",
          field: "responsibilities",
        },
      },
    },
  },
  Person: {
    meta: {
      singular: "person",
      plural: "people",
    },
    fields: {
      role: {
        type: "Inverse",
        source: {
          type: "Role",
          field: "holder",
        },
      },
    },
  },
  Team: {
    meta: {
      singular: "team",
      plural: "teams",
    },
    fields: {
      members: {
        type: "Inverse",
        source: {
          type: "Role",
          field: "teams",
        },
      },
    },
  },
};

describe("RecordSet initialization", () => {
  test("no schema", () => {
    expect(() => {
      new RecordSet({});
    }).not.toThrow();
  });

  test("minimal schema", () => {
    expect(() => {
      new RecordSet(MINIMAL_SCHEMA);
    }).not.toThrow();
  });

  describe("config", () => {
    test("minimal init", () => {
      expect(() => {
        new RecordSet(
          {},
          {
            init: [],
          },
        );
      }).not.toThrow();
    });

    test.skip("init with record not in schema", () => {
      expect(() => {
        new RecordSet(
          {},
          {
            init: [{ type: "Record", id: "87c22bff-926f-4005-a359-69bb996eab1f" }],
          },
        );
      }).toThrow();
    });

    test.skip("init with record missing type", () => {
      expect(() => {
        new RecordSet(MINIMAL_SCHEMA, {
          init: [{ id: "87c22bff-926f-4005-a359-69bb996eab1f" } as any],
        });
      }).toThrow();
    });

    test.skip("init with record missing id", () => {
      expect(() => {
        new RecordSet(MINIMAL_SCHEMA, {
          init: [{ type: "Record" } as any],
        });
      }).toThrow();
    });
  });
});

describe("RecordSet schema generation", () => {
  test("no schema", () => {
    const recordSet = new RecordSet({});
    expect(printSchema(recordSet.schema).trim()).toBe(
      dedent`
        schema {
          query: RootQueryType
          mutation: RootMutationType
        }

        type RootQueryType {
          relationships(foreignKeys: [ForeignKeyInput]): [Relationship]
        }

        type Relationship {
          source: Node
          target: Node
        }

        interface Node {
          id: String!
        }

        input ForeignKeyInput {
          type: String!
          field: String!
        }

        type RootMutationType {
          addRelationship(field: String!, source: String!, target: String!): Node
          removeRelationship(field: String!, source: String!, target: String!): Node
        }
      `.trim(),
    );
  });

  test("minimal schema", () => {
    const recordSet = new RecordSet(MINIMAL_SCHEMA);
    expect(printSchema(recordSet.schema).trim()).toBe(
      dedent`
        schema {
          query: RootQueryType
          mutation: RootMutationType
        }

        type RootQueryType {
          relationships(foreignKeys: [ForeignKeyInput]): [Relationship]
          record(id: String!): Record
          records(ids: [String!]): [Record]!
        }

        type Relationship {
          source: Node
          target: Node
        }

        interface Node {
          id: String!
        }

        input ForeignKeyInput {
          type: String!
          field: String!
        }

        type Record implements Node {
          id: String!
        }

        type RootMutationType {
          addRelationship(field: String!, source: String!, target: String!): Node
          removeRelationship(field: String!, source: String!, target: String!): Node
          createRecord(id: String): Record
          updateRecord(id: String!): Record
          deleteRecord(id: String!): Record
        }
      `.trim(),
    );
  });

  test("scalar fields", () => {
    const recordSet = new RecordSet(SCALAR_FIELDS_SCHEMA);
    expect(printSchema(recordSet.schema).trim()).toBe(
      dedent`
        schema {
          query: RootQueryType
          mutation: RootMutationType
        }

        type RootQueryType {
          relationships(foreignKeys: [ForeignKeyInput]): [Relationship]
          record(id: String!): Record
          records(ids: [String!]): [Record]!
        }

        type Relationship {
          source: Node
          target: Node
        }

        interface Node {
          id: String!
        }

        input ForeignKeyInput {
          type: String!
          field: String!
        }

        type Record implements Node {
          id: String!
          string: String
          number: Float
          boolean: Boolean
          date: String
        }

        type RootMutationType {
          addRelationship(field: String!, source: String!, target: String!): Node
          removeRelationship(field: String!, source: String!, target: String!): Node
          createRecord(id: String, string: String, number: Float, boolean: Boolean, date: String): Record
          updateRecord(id: String!, string: String, number: Float, boolean: Boolean, date: String): Record
          deleteRecord(id: String!): Record
        }
      `.trim(),
    );
  });

  test("foreign keys", () => {
    const recordSet = new RecordSet(FOREIGN_KEYS_SCHEMA);
    expect(printSchema(recordSet.schema).trim()).toBe(
      dedent`
        schema {
          query: RootQueryType
          mutation: RootMutationType
        }

        type RootQueryType {
          relationships(foreignKeys: [ForeignKeyInput]): [Relationship]
          record(id: String!): Record
          records(ids: [String!]): [Record]!
        }

        type Relationship {
          source: Node
          target: Node
        }

        interface Node {
          id: String!
        }

        input ForeignKeyInput {
          type: String!
          field: String!
        }

        type Record implements Node {
          id: String!
          manyToMany: [Node]!
          manyToOne: Node
          oneToOne: Node
          oneToMany: [Node]!
        }

        type RootMutationType {
          addRelationship(field: String!, source: String!, target: String!): Node
          removeRelationship(field: String!, source: String!, target: String!): Node
          createRecord(id: String): Record
          updateRecord(id: String!): Record
          deleteRecord(id: String!): Record
        }
      `.trim(),
    );
  });

  test("inverse relations", () => {
    const recordSet = new RecordSet(INVERSE_RELATIONS_SCHEMA);
    expect(printSchema(recordSet.schema).trim()).toBe(
      dedent`
        schema {
          query: RootQueryType
          mutation: RootMutationType
        }

        type RootQueryType {
          relationships(foreignKeys: [ForeignKeyInput]): [Relationship]
          record(id: String!): Record
          records(ids: [String!]): [Record]!
        }

        type Relationship {
          source: Node
          target: Node
        }

        interface Node {
          id: String!
        }

        input ForeignKeyInput {
          type: String!
          field: String!
        }

        type Record implements Node {
          id: String!
          manyToMany: [Node]!
          manyToOne: Node
          oneToOne: Node
          oneToMany: [Node]!
          inverseManyToMany: [Node]!
          inverseManyToOne: [Node]!
          inverseOneToOne: Node
          inverseOneToMany: Node
          inverseMultiple: [Node]!
        }

        type RootMutationType {
          addRelationship(field: String!, source: String!, target: String!): Node
          removeRelationship(field: String!, source: String!, target: String!): Node
          createRecord(id: String): Record
          updateRecord(id: String!): Record
          deleteRecord(id: String!): Record
        }
      `.trim(),
    );
  });

  test.skip("complex", () => {
    const recordSet = new RecordSet(COMPLEX_SCHEMA);
    expect(printSchema(recordSet.schema).trim()).toBe(
      dedent`
        schema {
          query: RootQueryType
          mutation: RootMutationType
        }

        type RootQueryType {
          relationships(foreignKeys: [ForeignKeyInput]): [Relationship]
          role(id: String!): Role
          roles(ids: [String!]): [Role]!
          # TODO
        }

        type Relationship {
          source: Node
          target: Node
        }

        interface Node {
          id: String!
        }

        input ForeignKeyInput {
          type: String!
          field: String!
        }

        type Role implements Node {
          id: String!
          # TODO
        }

        # TODO

        type RootMutationType {
          addRelationship(field: String!, source: String!, target: String!): Node
          removeRelationship(field: String!, source: String!, target: String!): Node
          createRole(id: String): Role
          updateRole(id: String!): Role
          deleteRole(id: String!): Role
        # TODO
        }
      `.trim(),
    );
  });
});

describe("RecordSet query resolution", () => {
  test("no schema", () => {
    const recordSet = new RecordSet({});

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            relationships(foreignKeys: [])
          }
        `,
      }),
    ).toEqual({ data: { relationships: [] } });
  });

  test("single record", () => {
    const recordSet = new RecordSet(MINIMAL_SCHEMA, {
      init: [
        {
          type: "Record",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
        },
      ],
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            record(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        record: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
        },
      },
    });
  });

  test("multiple records", () => {
    const recordSet = new RecordSet(MINIMAL_SCHEMA, {
      init: [
        {
          type: "Record",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
        },
      ],
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            records(ids: ["267d5cb0-90aa-471c-b5fc-3b31afd73184"]) {
              id
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        records: [
          {
            id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          },
        ],
      },
    });
  });

  test("all records", () => {
    const recordSet = new RecordSet(MINIMAL_SCHEMA, {
      init: [
        {
          type: "Record",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
        },
      ],
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            records {
              id
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        records: [
          {
            id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          },
        ],
      },
    });
  });

  test("scalar fields", () => {
    const recordSet = new RecordSet(SCALAR_FIELDS_SCHEMA, {
      init: [
        {
          type: "Record",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          string: "hello",
          number: 1,
          boolean: true,
          date: "2021-06-17T19:54:14Z",
        },
      ],
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            record(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
              ... on Record {
                string
                number
                boolean
                date
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        record: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          string: "hello",
          number: 1,
          boolean: true,
          date: "2021-06-17T19:54:14Z",
        },
      },
    });
  });

  test("foreign keys", () => {
    const recordSet = new RecordSet(FOREIGN_KEYS_SCHEMA, {
      init: [
        {
          type: "Record",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          manyToMany: ["267d5cb0-90aa-471c-b5fc-3b31afd73184"],
          manyToOne: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          oneToOne: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          oneToMany: ["267d5cb0-90aa-471c-b5fc-3b31afd73184"],
        },
      ],
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            record(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
              manyToMany {
                id
              }
              manyToOne {
                id
              }
              oneToOne {
                id
              }
              oneToMany {
                id
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        record: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          manyToMany: [{ id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" }],
          manyToOne: { id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" },
          oneToOne: { id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" },
          oneToMany: [{ id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" }],
        },
      },
    });
  });

  test("inverse relations", () => {
    const recordSet = new RecordSet(INVERSE_RELATIONS_SCHEMA, {
      init: [
        {
          type: "Record",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          manyToMany: ["71dddd29-680d-4dbd-92ed-2ea085a569cb"],
          manyToOne: "71dddd29-680d-4dbd-92ed-2ea085a569cb",
          oneToOne: "71dddd29-680d-4dbd-92ed-2ea085a569cb",
          oneToMany: ["71dddd29-680d-4dbd-92ed-2ea085a569cb"],
        },
        {
          type: "Record",
          id: "71dddd29-680d-4dbd-92ed-2ea085a569cb",
          manyToMany: [],
          oneToMany: [],
        },
      ],
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            record(id: "71dddd29-680d-4dbd-92ed-2ea085a569cb") {
              id
              inverseManyToMany {
                id
              }
              inverseManyToOne {
                id
              }
              inverseOneToOne {
                id
              }
              inverseOneToMany {
                id
              }
              inverseMultiple {
                id
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        record: {
          id: "71dddd29-680d-4dbd-92ed-2ea085a569cb",
          inverseManyToMany: [{ id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" }],
          inverseManyToOne: [{ id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" }],
          inverseOneToOne: { id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" },
          inverseOneToMany: { id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" },
          inverseMultiple: [{ id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" }],
        },
      },
    });
  });

  test("complex", () => {
    const recordSet = new RecordSet(COMPLEX_SCHEMA, {
      init: [
        {
          type: "Role",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          lineManager: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9",
          responsibilities: ["bb3c823a-1a2a-4a8a-b650-14a54f595444"],
          holder: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
          teams: ["1728d91a-001f-421d-90a3-9c8ac337f796"],
        },
        {
          type: "Role",
          id: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9",
        },
        {
          type: "Responsibility",
          id: "bb3c823a-1a2a-4a8a-b650-14a54f595444",
        },
        {
          type: "Person",
          id: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
        },
        {
          type: "Team",
          id: "1728d91a-001f-421d-90a3-9c8ac337f796",
        },
      ],
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            role(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
              ... on Role {
                lineManager {
                  id
                  ... on Role {
                    reports {
                      id
                    }
                  }
                }
                responsibilities {
                  id
                  ... on Responsibility {
                    owner {
                      id
                    }
                  }
                }
                holder {
                  id
                  ... on Person {
                    role {
                      id
                    }
                  }
                }
                teams {
                  id
                  ... on Team {
                    members {
                      id
                    }
                  }
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        role: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          lineManager: {
            id: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9",
            reports: [
              {
                id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
              },
            ],
          },
          responsibilities: [
            {
              id: "bb3c823a-1a2a-4a8a-b650-14a54f595444",
              owner: {
                id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
              },
            },
          ],
          holder: {
            id: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
            role: {
              id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
            },
          },
          teams: [
            {
              id: "1728d91a-001f-421d-90a3-9c8ac337f796",
              members: [
                {
                  id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
                },
              ],
            },
          ],
        },
      },
    });
  });
});

describe("RecordSet mutation resolution", () => {
  test("minimal schema", () => {
    const recordSet = new RecordSet(MINIMAL_SCHEMA);

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            createRecord(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
            }
          }
        `,
      }),
    ).toEqual({ data: { createRecord: { id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" } } });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            record(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
            }
          }
        `,
      }),
    ).toEqual({ data: { record: { id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" } } });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            deleteRecord(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
            }
          }
        `,
      }),
    ).toEqual({ data: { deleteRecord: { id: "267d5cb0-90aa-471c-b5fc-3b31afd73184" } } });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            record(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
            }
          }
        `,
      }),
    ).toEqual({ data: { record: null } });
  });

  test("scalar fields", () => {
    const recordSet = new RecordSet(SCALAR_FIELDS_SCHEMA, {
      init: [
        {
          type: "Record",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          string: "hello",
          number: 1,
          boolean: true,
          date: "2021-06-17T19:54:14Z",
        },
      ],
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            updateRecord(
              id: "267d5cb0-90aa-471c-b5fc-3b31afd73184"
              string: "world"
              number: 2
              boolean: false
              date: "2020-07-11T09:43:15Z"
            ) {
              id
              ... on Record {
                string
                number
                boolean
                date
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        updateRecord: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          string: "world",
          number: 2,
          boolean: false,
          date: "2020-07-11T09:43:15Z",
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            record(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
              ... on Record {
                string
                number
                boolean
                date
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        record: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          string: "world",
          number: 2,
          boolean: false,
          date: "2020-07-11T09:43:15Z",
        },
      },
    });
  });

  test("addRelationship", () => {
    const recordSet = new RecordSet(COMPLEX_SCHEMA, {
      init: [
        {
          type: "Role",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
        },
        {
          type: "Role",
          id: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9",
        },
        {
          type: "Responsibility",
          id: "bb3c823a-1a2a-4a8a-b650-14a54f595444",
        },
        {
          type: "Person",
          id: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
        },
        {
          type: "Team",
          id: "1728d91a-001f-421d-90a3-9c8ac337f796",
        },
      ],
    });

    const mockHandler = jest.fn();

    recordSet.addEventListener("change", mockHandler);

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            addRelationship(
              field: "lineManager"
              source: "267d5cb0-90aa-471c-b5fc-3b31afd73184"
              target: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9"
            ) {
              id
              ... on Role {
                lineManager {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        addRelationship: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          lineManager: {
            id: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9",
          },
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            addRelationship(
              field: "responsibilities"
              source: "267d5cb0-90aa-471c-b5fc-3b31afd73184"
              target: "bb3c823a-1a2a-4a8a-b650-14a54f595444"
            ) {
              id
              ... on Role {
                responsibilities {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        addRelationship: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          responsibilities: [
            {
              id: "bb3c823a-1a2a-4a8a-b650-14a54f595444",
            },
          ],
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            addRelationship(
              field: "holder"
              source: "267d5cb0-90aa-471c-b5fc-3b31afd73184"
              target: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9"
            ) {
              id
              ... on Role {
                holder {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        addRelationship: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          holder: {
            id: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
          },
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            addRelationship(
              field: "teams"
              source: "267d5cb0-90aa-471c-b5fc-3b31afd73184"
              target: "1728d91a-001f-421d-90a3-9c8ac337f796"
            ) {
              id
              ... on Role {
                teams {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        addRelationship: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          teams: [
            {
              id: "1728d91a-001f-421d-90a3-9c8ac337f796",
            },
          ],
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            role(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
              ... on Role {
                lineManager {
                  id
                }
                responsibilities {
                  id
                }
                holder {
                  id
                }
                teams {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        role: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          lineManager: {
            id: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9",
          },
          responsibilities: [
            {
              id: "bb3c823a-1a2a-4a8a-b650-14a54f595444",
            },
          ],
          holder: {
            id: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
          },
          teams: [
            {
              id: "1728d91a-001f-421d-90a3-9c8ac337f796",
            },
          ],
        },
      },
    });

    expect(mockHandler).toHaveBeenCalledTimes(4);

    recordSet.removeEventListener("change", mockHandler);
  });

  test("addRelationship enforce unique one-to-x relationships", () => {
    const recordSet = new RecordSet(COMPLEX_SCHEMA, {
      init: [
        {
          type: "Role",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          holder: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
          responsibilities: ["50617c1a-1398-40a2-9d36-fdac87e2e9aa"],
        },
        {
          type: "Role",
          id: "b7290c75-9f4b-4b3c-987d-3ea5b7a707ed",
          responsibilities: [],
        },
        {
          type: "Responsibility",
          id: "50617c1a-1398-40a2-9d36-fdac87e2e9aa",
        },
        {
          type: "Person",
          id: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
        },
      ],
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            addRelationship(
              field: "holder"
              source: "b7290c75-9f4b-4b3c-987d-3ea5b7a707ed"
              target: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9"
            ) {
              id
              ... on Role {
                holder {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        addRelationship: {
          id: "b7290c75-9f4b-4b3c-987d-3ea5b7a707ed",
          holder: {
            id: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
          },
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            addRelationship(
              field: "responsibilities"
              source: "b7290c75-9f4b-4b3c-987d-3ea5b7a707ed"
              target: "50617c1a-1398-40a2-9d36-fdac87e2e9aa"
            ) {
              id
              ... on Role {
                responsibilities {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        addRelationship: {
          id: "b7290c75-9f4b-4b3c-987d-3ea5b7a707ed",
          responsibilities: [
            {
              id: "50617c1a-1398-40a2-9d36-fdac87e2e9aa",
            },
          ],
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            role(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
              ... on Role {
                holder {
                  id
                }
                responsibilities {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        role: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          holder: null,
          responsibilities: [],
        },
      },
    });
  });

  test("removeRelationship", () => {
    const recordSet = new RecordSet(COMPLEX_SCHEMA, {
      init: [
        {
          type: "Role",
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          lineManager: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9",
          responsibilities: ["bb3c823a-1a2a-4a8a-b650-14a54f595444"],
          holder: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
          teams: ["1728d91a-001f-421d-90a3-9c8ac337f796"],
        },
        {
          type: "Role",
          id: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9",
        },
        {
          type: "Responsibility",
          id: "bb3c823a-1a2a-4a8a-b650-14a54f595444",
        },
        {
          type: "Person",
          id: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9",
        },
        {
          type: "Team",
          id: "1728d91a-001f-421d-90a3-9c8ac337f796",
        },
      ],
    });

    const mockHandler = jest.fn();

    recordSet.addEventListener("change", mockHandler);

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            removeRelationship(
              field: "lineManager"
              source: "267d5cb0-90aa-471c-b5fc-3b31afd73184"
              target: "668b05fc-7e2a-492b-9ba3-8ee4cedbfdb9"
            ) {
              id
              ... on Role {
                lineManager {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        removeRelationship: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          lineManager: null,
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            removeRelationship(
              field: "responsibilities"
              source: "267d5cb0-90aa-471c-b5fc-3b31afd73184"
              target: "bb3c823a-1a2a-4a8a-b650-14a54f595444"
            ) {
              id
              ... on Role {
                responsibilities {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        removeRelationship: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          responsibilities: [],
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            removeRelationship(
              field: "holder"
              source: "267d5cb0-90aa-471c-b5fc-3b31afd73184"
              target: "0fce7933-b729-4c8b-bec5-f3b261e2f5a9"
            ) {
              id
              ... on Role {
                holder {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        removeRelationship: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          holder: null,
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          mutation {
            removeRelationship(
              field: "teams"
              source: "267d5cb0-90aa-471c-b5fc-3b31afd73184"
              target: "1728d91a-001f-421d-90a3-9c8ac337f796"
            ) {
              id
              ... on Role {
                teams {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        removeRelationship: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          teams: [],
        },
      },
    });

    expect(
      execute({
        schema: recordSet.schema,
        document: gql`
          query {
            role(id: "267d5cb0-90aa-471c-b5fc-3b31afd73184") {
              id
              ... on Role {
                lineManager {
                  id
                }
                responsibilities {
                  id
                }
                holder {
                  id
                }
                teams {
                  id
                }
              }
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        role: {
          id: "267d5cb0-90aa-471c-b5fc-3b31afd73184",
          lineManager: null,
          responsibilities: [],
          holder: null,
          teams: [],
        },
      },
    });

    expect(mockHandler).toHaveBeenCalledTimes(4);

    recordSet.removeEventListener("change", mockHandler);
  });
});

describe("RecordSet query", () => {
  test("variables", () => {
    const recordSet = new RecordSet(
      {
        Thing: {
          meta: {
            singular: "thing",
            plural: "things",
          },
          fields: {
            name: {
              type: "String",
            },
          },
        },
      },
      {
        init: [
          {
            type: "Thing",
            id: "3a3b76bc-5146-4ed2-a00c-3b11003f4f1b",
            name: "Example thing",
          },
        ],
      },
    );

    expect(
      recordSet.query(
        gql`
          query ($id: String) {
            thing(id: $id) {
              name
            }
          }
        `,
        { id: "3a3b76bc-5146-4ed2-a00c-3b11003f4f1b" },
      ),
    ).toEqual({
      thing: {
        name: "Example thing",
      },
    });
  });

  test("error handling", () => {
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const recordSet = new RecordSet({
      Thing: {
        meta: {
          singular: "thing",
          plural: "things",
        },
        fields: {
          name: {
            type: "String",
          },
        },
      },
    });

    expect(
      recordSet.query(gql`
        query {
          thing {
            id
          }
        }
      `),
    ).toEqual({
      thing: null,
    });

    expect(console.log).toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

describe("RecordSet persistence", () => {
  test("custom", () => {
    const persistence = {
      load: jest
        .fn()
        .mockReturnValue([{ type: "Thing", id: "f365bb65-16b2-4053-bbf3-cd207afaa798" }]),
      save: jest.fn(),
    };
    const recordSet = new RecordSet(
      {
        Thing: {
          meta: {
            singular: "thing",
            plural: "things",
          },
          fields: {},
        },
      },
      {
        persistence,
      },
    );
    recordSet.query(gql`
      mutation {
        createThing(id: "7cd41d28-810b-4f63-b527-5c376e2571be") {
          id
        }
      }
    `);
    expect(persistence.load.mock.calls.length).toBe(1);
    expect(persistence.save.mock.calls.length).toBe(1);
    expect(persistence.save.mock.calls[0][0]).toEqual([
      { type: "Thing", id: "f365bb65-16b2-4053-bbf3-cd207afaa798" },
      { type: "Thing", id: "7cd41d28-810b-4f63-b527-5c376e2571be" },
    ]);
  });

  browserOnlyTest("LocalStoragePersistence", () => {
    const getItemSpy = jest
      .spyOn(global.Storage.prototype, "getItem")
      .mockReturnValue(
        JSON.stringify([{ type: "Thing", id: "8681019f-6c9e-466c-8867-6844b1b7b3c6" }]),
      );
    const setItemSpy = jest.spyOn(global.Storage.prototype, "setItem");
    const persistence = new LocalStoragePersistence();
    const recordSet = new RecordSet(
      {
        Thing: {
          meta: {
            singular: "thing",
            plural: "things",
          },
          fields: {},
        },
      },
      {
        persistence,
      },
    );
    recordSet.query(gql`
      mutation {
        createThing(id: "a419c660-dcb6-4ed2-af4b-8a7fef2c0761") {
          id
        }
      }
    `);
    expect(getItemSpy.mock.calls.length).toBe(1);
    expect(getItemSpy.mock.calls[0][0]).toBe("recordSet");
    expect(setItemSpy.mock.calls.length).toBe(1);
    expect(setItemSpy.mock.calls[0][0]).toBe("recordSet");
    expect(setItemSpy.mock.calls[0][1]).toBe(
      JSON.stringify([
        { type: "Thing", id: "8681019f-6c9e-466c-8867-6844b1b7b3c6" },
        { type: "Thing", id: "a419c660-dcb6-4ed2-af4b-8a7fef2c0761" },
      ]),
    );
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  browserOnlyTest("UrlPersistence", () => {
    history.replaceState(
      null,
      "",
      `#${toBase64(
        JSON.stringify([{ type: "Thing", id: "0d07ed2f-20bb-414b-bea1-362a19bebda5" }]),
        true,
      )}`,
    );
    const setReplaceState = jest.spyOn(history, "replaceState");
    const persistence = new UrlPersistence();
    const recordSet = new RecordSet(
      {
        Thing: {
          meta: {
            singular: "thing",
            plural: "things",
          },
          fields: {},
        },
      },
      {
        persistence,
      },
    );
    recordSet.query(gql`
      mutation {
        createThing(id: "0888f6d3-33a2-4818-81e8-311adb5093ae") {
          id
        }
      }
    `);
    expect(setReplaceState.mock.calls.length).toBe(1);
    expect(setReplaceState.mock.calls[0][2]).toBe(
      `#${toBase64(
        JSON.stringify([
          { type: "Thing", id: "0d07ed2f-20bb-414b-bea1-362a19bebda5" },
          { type: "Thing", id: "0888f6d3-33a2-4818-81e8-311adb5093ae" },
        ]),
        true,
      )}`,
    );
    setReplaceState.mockRestore();
    history.replaceState(null, "", " ");
  });
});

describe("schema helpers", () => {
  test("StringField", () => {
    expect(StringField()).toEqual({
      type: "String",
    });
  });

  test("NumberField", () => {
    expect(NumberField()).toEqual({
      type: "Number",
    });
  });

  test("BooleanField", () => {
    expect(BooleanField()).toEqual({
      type: "Boolean",
    });
  });

  test("DateField", () => {
    expect(DateField()).toEqual({
      type: "Date",
    });
  });

  test("ForeignKeyField", () => {
    expect(ForeignKeyField("manyToOne")).toEqual({
      type: "ForeignKey",
      cardinality: "manyToOne",
    });
    expect(ForeignKeyField("oneToMany")).toEqual({
      type: "ForeignKey",
      cardinality: "oneToMany",
    });
    expect(ForeignKeyField("oneToOne")).toEqual({
      type: "ForeignKey",
      cardinality: "oneToOne",
    });
    expect(ForeignKeyField("manyToMany")).toEqual({
      type: "ForeignKey",
      cardinality: "manyToMany",
    });
  });

  test("DateField", () => {
    expect(InverseField("Role#lineManager")).toEqual({
      type: "Inverse",
      source: {
        type: "Role",
        field: "lineManager",
      },
    });
    expect(InverseField(["Role#lineManager", "Foo#bar"])).toEqual({
      type: "Inverse",
      source: [
        {
          type: "Role",
          field: "lineManager",
        },
        {
          type: "Foo",
          field: "bar",
        },
      ],
    });
  });

  test("full schema", () => {
    const recordSet = new RecordSet({
      Role: {
        meta: {
          singular: "role",
          plural: "roles",
        },
        fields: {
          name: StringField(),
          rank: NumberField(),
          isArchived: BooleanField(),
          dateCreated: DateField(),
          lineManager: ForeignKeyField("manyToOne"),
          responsibilities: ForeignKeyField("oneToMany"),
          holder: ForeignKeyField("oneToOne"),
          teams: ForeignKeyField("manyToMany"),
          reports: InverseField("Role#lineManager"),
        },
      },
      Responsibility: {
        meta: {
          singular: "responsibility",
          plural: "responsibilities",
        },
        fields: {
          owner: InverseField("Role#responsibilities"),
        },
      },
      Person: {
        meta: {
          singular: "person",
          plural: "people",
        },
        fields: {
          role: InverseField("Role#holder"),
        },
      },
      Team: {
        meta: {
          singular: "team",
          plural: "teams",
        },
        fields: {
          members: InverseField("Role#teams"),
        },
      },
    });
    expect(printSchema(recordSet.schema).trim()).toBe(
      dedent`
        schema {
          query: RootQueryType
          mutation: RootMutationType
        }

        type RootQueryType {
          relationships(foreignKeys: [ForeignKeyInput]): [Relationship]
          role(id: String!): Role
          roles(ids: [String!]): [Role]!
          responsibility(id: String!): Responsibility
          responsibilities(ids: [String!]): [Responsibility]!
          person(id: String!): Person
          people(ids: [String!]): [Person]!
          team(id: String!): Team
          teams(ids: [String!]): [Team]!
        }

        type Relationship {
          source: Node
          target: Node
        }

        interface Node {
          id: String!
        }

        input ForeignKeyInput {
          type: String!
          field: String!
        }

        type Role implements Node {
          id: String!
          name: String
          rank: Float
          isArchived: Boolean
          dateCreated: String
          lineManager: Node
          responsibilities: [Node]!
          holder: Node
          teams: [Node]!
          reports: [Node]!
        }

        type Responsibility implements Node {
          id: String!
          owner: Node
        }

        type Person implements Node {
          id: String!
          role: Node
        }

        type Team implements Node {
          id: String!
          members: [Node]!
        }

        type RootMutationType {
          addRelationship(field: String!, source: String!, target: String!): Node
          removeRelationship(field: String!, source: String!, target: String!): Node
          createRole(id: String, name: String, rank: Float, isArchived: Boolean, dateCreated: String): Role
          updateRole(id: String!, name: String, rank: Float, isArchived: Boolean, dateCreated: String): Role
          deleteRole(id: String!): Role
          createResponsibility(id: String): Responsibility
          updateResponsibility(id: String!): Responsibility
          deleteResponsibility(id: String!): Responsibility
          createPerson(id: String): Person
          updatePerson(id: String!): Person
          deletePerson(id: String!): Person
          createTeam(id: String): Team
          updateTeam(id: String!): Team
          deleteTeam(id: String!): Team
        }
      `.trim(),
    );
  });
});

describe("useRecordSet", () => {
  nodeOnlyTest("local storage persistence doesn't error in node", () => {
    expect(() => {
      createRecordSet(
        {
          Person: {
            meta: {
              singular: "person",
              plural: "people",
            },
            fields: {
              name: StringField(),
            },
          },
        },
        {
          persistence: "localStorage",
        },
      );
    }).not.toThrow();
  });

  nodeOnlyTest("url persistence works in node", () => {
    expect(() => {
      createRecordSet(
        {
          Person: {
            meta: {
              singular: "person",
              plural: "people",
            },
            fields: {
              name: StringField(),
            },
          },
        },
        {
          persistence: "url",
        },
      );
    }).not.toThrow();
  });

  browserOnlyTest("end to end", () => {
    const { useRecordSet, updateRecordSet } = createRecordSet(
      {
        Role: {
          meta: {
            singular: "role",
            plural: "roles",
          },
          fields: {
            name: StringField(),
            rank: NumberField(),
            isArchived: BooleanField(),
            dateCreated: DateField(),
            lineManager: ForeignKeyField("manyToOne"),
            responsibilities: ForeignKeyField("oneToMany"),
            holder: ForeignKeyField("oneToOne"),
            teams: ForeignKeyField("manyToMany"),
            reports: InverseField("Role#lineManager"),
          },
        },
        Responsibility: {
          meta: {
            singular: "responsibility",
            plural: "responsibilities",
          },
          fields: {
            owner: InverseField("Role#responsibilities"),
          },
        },
        Person: {
          meta: {
            singular: "person",
            plural: "people",
          },
          fields: {
            role: InverseField("Role#holder"),
          },
        },
        Team: {
          meta: {
            singular: "team",
            plural: "teams",
          },
          fields: {
            members: InverseField("Role#teams"),
          },
        },
      },
      {
        persistence: "url",
      },
    );
    const { result } = renderHook(() =>
      useRecordSet(gql`
        query {
          roles {
            id
            name
            rank
          }
        }
      `),
    );

    act(() => {
      updateRecordSet(gql`
        mutation {
          createRole(id: "de483855-adcb-4fad-9825-69bc72d3c35c", name: "Example", rank: 1)
        }
      `);
    });

    expect(result.current?.roles).toEqual([
      {
        id: "de483855-adcb-4fad-9825-69bc72d3c35c",
        name: "Example",
        rank: 1,
      },
    ]);

    expect(JSON.parse(fromBase64(window.location.hash.slice(1).trim()))).toEqual([
      {
        type: "Role",
        id: "de483855-adcb-4fad-9825-69bc72d3c35c",
        name: "Example",
        rank: 1,
      },
    ]);
  });
});
