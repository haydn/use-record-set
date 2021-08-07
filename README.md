<div align="center">
  <h1>
    <img src="logo.png" alt="useRecordSet" width="160" />
  </h1>
  <p>A React hook for quickly prototyping data models.</p>
  <p>
    <img alt="npm bundle size" src="https://img.shields.io/bundlephobia/min/use-record-set.svg">
    <img alt="npm" src="https://img.shields.io/npm/dw/use-record-set.svg">
  </p>
</div>

## Features

- More powerful than local state, less complex than a full data layer.
- Support for modeling one-to-one, one-to-many, many-to-many and many-to-one relationships.
- Synchronous GraphQL queries and mutations to access and update data.
- Flow and TypeScript declarations included.
- CommonJS, UMD and ESM modules provided.

Demo: https://09qzj.csb.app/

## Installation

Yarn:

```shell
yarn add use-record-set graphql-tag
```

npm:

```shell
npm install use-record-set graphql-tag
```

Note: [graphql-tag](https://github.com/apollographql/graphql-tag) is recommend to parse GraphQL queries.

## Usage

```js
import { createRecordSet, StringField, ForeignKeyField, InverseField } from "use-record-set";

const schema = {
  Group: {
    meta: {
      singular: "group",
      plural: "groups",
    },
    fields: {
      name: StringField(),
      members: ForeignKeyField("manyToMany"),
    },
  },
  Person: {
    meta: {
      singular: "person",
      plural: "people",
    },
    fields: {
      name: StringField(),
      groups: InverseField("Group#members"),
    },
  },
};

const records = [
  {
    type: "Group",
    id: "3d6ff8ff-d23e-4421-bfe1-b2fabd1ccb8c",
    name: "Group A",
    members: ["7de3a1cf-5f26-4c56-b453-5dd2a33697fc"],
  },
  {
    type: "Person",
    id: "7de3a1cf-5f26-4c56-b453-5dd2a33697fc",
    name: "Person A",
  },
];

const { useRecordSet } = createRecordSet(schema, { init: records });

const MyComponent = () => {
  const { group } = useRecordSet(
    gql`
      query ($id: String) {
        group(id: $id) {
          ... on Group {
            id
            name
            members {
              ... on Person {
                id
                name
                groups {
                  ... on Group {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `,
    { id: "3d6ff8ff-d23e-4421-bfe1-b2fabd1ccb8c" },
  );
  return (
    <ul>
      {group.members.map((member) => (
        <li key={member.id}>
          {member.name}
          <ul>
            {member.groups.map((group) => (
              <li key={group.id}>{group.name}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
};
```
