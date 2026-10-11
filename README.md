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
- Generate a GraphQL schema file for editor tooling and code generation.
- Flow and TypeScript declarations included.
- CommonJS, UMD and ESM modules provided.

Demo: https://09qzj.csb.app/

## Installation

Bun:

```shell
bun add use-record-set graphql-tag
```

pnpm:

```shell
pnpm add use-record-set graphql-tag
```

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

## Generating a GraphQL schema file

A GraphQL schema file lets editor tooling autocomplete and validate your queries, and tools like [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) generate types for them.

Put your schema in its own module, exported as the default export:

```ts
// src/schema.ts
import type { Schema } from "use-record-set";
import { StringField, ForeignKeyField, InverseField } from "use-record-set";

const schema: Schema = {
  // …
};

export default schema;
```

Then use the `use-record-set` command to print the GraphQL schema:

```shell
npx use-record-set print-schema src/schema.ts -o schema.graphql
```

Options:

- `-o, --output <file>`: Write the schema to a file instead of stdout.
- `-e, --export <name>`: Use a named export instead of the default export.
- `-w, --watch`: Regenerate the schema whenever the schema file changes (requires `--output`).

The schema module is loaded with Node, so it shouldn't import anything that can't run outside the browser (React components, CSS, etc.). TypeScript files are supported natively by Node 22.18+, as long as types are imported with `import type` and no TypeScript-only syntax (e.g. enums) is used. Otherwise, run the command with a loader like [tsx](https://tsx.is): `npx tsx node_modules/.bin/use-record-set …`.

The schema can also be printed programmatically:

```js
import { printRecordSetSchema } from "use-record-set";

const sdl = printRecordSetSchema(schema);
```
