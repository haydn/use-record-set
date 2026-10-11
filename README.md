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

## Relationships

Relationship lists are never `null` and never contain `null` (`[Node!]!`). IDs that don't resolve to a record (e.g. one that has been deleted) are left out.

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

Bun:

```shell
bunx use-record-set print-schema src/schema.ts -o schema.gen.graphql
```

pnpm:

```shell
pnpm exec use-record-set print-schema src/schema.ts -o schema.gen.graphql
```

Yarn:

```shell
yarn use-record-set print-schema src/schema.ts -o schema.gen.graphql
```

npm:

```shell
npx use-record-set print-schema src/schema.ts -o schema.gen.graphql
```

Options:

- `-o, --output <file>`: Write the schema to a file instead of stdout.
- `-e, --export <name>`: Use a named export instead of the default export.
- `-w, --watch`: Regenerate the schema whenever the schema file changes (requires `--output`).

The schema module is loaded with Node, so it shouldn't import anything that can't run outside the browser (React components, CSS, etc.). TypeScript files are supported natively by Node 22.18+, as long as types are imported with `import type` and no TypeScript-only syntax (e.g. enums) is used. Otherwise, run the command with a loader like [tsx](https://tsx.is):

- Bun: `bunx tsx node_modules/.bin/use-record-set …`
- pnpm: `pnpm dlx tsx node_modules/.bin/use-record-set …`
- Yarn: `yarn dlx tsx node_modules/.bin/use-record-set …`
- npm: `npx tsx node_modules/.bin/use-record-set …`

## Typed queries

`useRecordSet` and `updateRecordSet` accept a [`TypedDocumentNode`](https://github.com/dotansimha/graphql-typed-document-node), inferring the result and variable types from it. Any tool that produces typed documents from the generated schema file will work.

Untyped documents (e.g. from `graphql-tag`) still work, returning `{ [key: string]: any }`.

### GraphQL Code Generator

Using the [client preset](https://the-guild.dev/graphql/codegen/plugins/presets/preset-client):

```ts
// codegen.ts
import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "schema.gen.graphql",
  documents: ["src/**/*.tsx"],
  generates: {
    "src/gql/": {
      preset: "client",
    },
  },
};

export default config;
```

```tsx
import { graphql } from "./gql";

const GroupQuery = graphql(`
  query Group($id: String!) {
    group(id: $id) {
      id
      name
      members {
        id
        ... on Person {
          name
        }
      }
    }
  }
`);

const MyComponent = ({ id }: { id: string }) => {
  // `group` is typed, and `id` is checked against the query's variables.
  const { group } = useRecordSet(GroupQuery, { id });
  // …
};
```

### gql.tada

Point the [gql.tada](https://gql-tada.0no.co) TypeScript plugin at the generated schema file:

```json
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "gql.tada/ts-plugin",
        "schema": "./schema.gen.graphql",
        "tadaOutputLocation": "./src/graphql-env.d.ts"
      }
    ]
  }
}
```

The plugin writes `graphql-env.d.ts` when the schema file changes in your editor. To write it from the command line (e.g. in CI), run `gql.tada generate output`.

```tsx
import { graphql } from "gql.tada";

const GroupQuery = graphql(`
  query Group($id: String!) {
    group(id: $id) {
      id
      name
      members {
        id
        ... on Person {
          name
        }
      }
    }
  }
`);

const MyComponent = ({ id }: { id: string }) => {
  const { group } = useRecordSet(GroupQuery, { id });
  // …
};
```

gql.tada masks fragments by default, so fields selected with a fragment spread need to be read with [`readFragment`](https://gql-tada.0no.co/guides/fragment-colocation).

## Printing the schema programmatically

The GraphQL schema can also be printed from code:

```js
import { printRecordSetSchema } from "use-record-set";

const sdl = printRecordSetSchema(schema);
```
