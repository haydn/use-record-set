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

## Installation

Yarn:

```shell
yarn add use-record-set graphql-tag
```

npm:

```shell
npm install use-record-set graphql-tag
```

## Usage

```js
// ./useRecordSet.js

import { createRecordSet } from "use-record-set";

const schema = {
  Group: {
    meta: {
      singular: "group",
      plural: "groups",
    },
    fields: {
      name: {
        type: "String",
      },
      members: {
        type: "ForeignKey",
        cardinality: "manyToMany",
      },
    },
  },
  Person: {
    meta: {
      singular: "person",
      plural: "people",
    },
    fields: {
      name: {
        type: "String",
      },
      groups: {
        type: "InverseRelation",
        sources: [
          {
            type: "Group",
            field: "members",
          },
        ],
      },
    },
  },
};

const records = [
  {
    type: "Group",
    id: "3d6ff8ff-d23e-4421-bfe1-b2fabd1ccb8c",
    name: "Group A",
  },
  {
    type: "Person",
    id: "7de3a1cf-5f26-4c56-b453-5dd2a33697fc",
    name: "Person A",
  },
];

const { useRecordSet, updateRecordSet } = createRecordSet(schema, {
  init: records,
  persistence: "url",
  localStorageKey: "recordSet",
});

export { useRecordSet, updateRecordSet };
```

```js
// ./index.js

import { useRecordSet, updateRecordSet } from "./useRecordSet";

const MyComponent = () => {
  const { group } = useRecordSet(
    gql`
      query($id: String) {
        group(id: $id) {
          members: {
            id,
            name,
            groups: {
              id
              name
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
        <li
          key={member.id}
          onClick={() => {
            const result = updateRecordSet(
              gql`
                mutation ($source: String, $target: String) {
                  removeRelationship(field: "members", source: $source, target: $target) {
                    id
                  }
                }
              `,
              { source: group.id, target: id },
            );
            if (!result) {
              throw Error("Unable to remove relationship");
            }
          }}
        >
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
