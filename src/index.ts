import type {
  PluginFunction,
  PluginValidateFn,
  Types
} from '@graphql-codegen/plugin-helpers';

import type {
  LoadedFragment
} from '@graphql-codegen/visitor-plugin-common';

import type {
  DocumentNode,
  FragmentDefinitionNode,
  GraphQLSchema
} from 'graphql';

import {
  Kind,
  concatAST,
  visit
} from 'graphql';

import type {
  MNTMGraphQLRawPluginConfig
} from './config';

import {
  MNTMGraphQLVisitor
} from './visitor';

import {
  extname
} from 'path';

export const plugin: PluginFunction<MNTMGraphQLRawPluginConfig, Types.ComplexPluginOutput> = (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config: MNTMGraphQLRawPluginConfig
) => {
  const allAst = concatAST(documents.map((v) => v.document).filter((d): d is DocumentNode => !!d));
  const allFragments: LoadedFragment[] = [
    ...(allAst.definitions.filter((d) => d.kind === Kind.FRAGMENT_DEFINITION) as FragmentDefinitionNode[]).map(
      (fragmentDef) => ({
        node: fragmentDef,
        name: fragmentDef.name.value,
        onType: fragmentDef.typeCondition.name.value,
        isExternal: false
      })
    ),
    ...config.externalFragments || []
  ];

  const visitor = new MNTMGraphQLVisitor(schema, allFragments, config);
  const visitorResult = visit(allAst, { leave: visitor });

  return {
    prepend: visitor.getImports(),
    content: [visitor.fragments, ...visitorResult.definitions.filter((t: any) => typeof t === 'string')].join('\n')
  };
};

export const validate: PluginValidateFn = async (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config: MNTMGraphQLRawPluginConfig,
  outputFile: string
) => {
  const ext = extname(outputFile);

  if (ext !== '.ts' && ext !== '.tsx') {
    throw new Error(`Plugin "@mntm/graphql-codegen" requires extension to be ".ts" or ".tsx"!`);
  }

  if (config.documentMode !== 'string') {
    throw new Error(`Plugin "@mntm/graphql-codegen" requires "documentMode: string"!`);
  }
};

export { MNTMGraphQLVisitor };
