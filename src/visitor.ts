import type {
  ClientSideBasePluginConfig,
  LoadedFragment
} from '@graphql-codegen/visitor-plugin-common';

import type {
  OperationDefinitionNode,
  FragmentDefinitionNode,
  GraphQLSchema
} from 'graphql';

import {
  print
} from 'graphql';

import type {
  MNTMGraphQLRawPluginConfig
} from './config';

import {
  ClientSideBaseVisitor
} from '@graphql-codegen/visitor-plugin-common';

import {
  default as autoBind
} from 'auto-bind';

import {
  default as pascalCase
} from 'pascalcase';

import {
  default as optimize
} from 'gqlmin';

export type MNTMGraphQLPluginConfig = ClientSideBasePluginConfig;

export class MNTMGraphQLVisitor extends ClientSideBaseVisitor<MNTMGraphQLRawPluginConfig, MNTMGraphQLPluginConfig> {
  _pureComment: string;

  constructor(schema: GraphQLSchema, fragments: LoadedFragment[], rawConfig: MNTMGraphQLRawPluginConfig) {
    super(schema, fragments, rawConfig, {});
    autoBind(this);
    this._pureComment = rawConfig.pureMagicComment ? '/*#__PURE__*/' : '';
  }

  protected _gql(node: FragmentDefinitionNode | OperationDefinitionNode): string {
    const fragments = this._transformFragments(node);

    let doc = this._prepareDocument(`
    ${print(node).split('\\').join('\\\\') /* Re-escape escaped values in GraphQL syntax */}
    ${this._includeFragments(fragments)}`);

    if (this.config.optimizeDocumentNode) {
      doc = optimize(doc);
    }

    return '`' + doc + '`';
  }

  public getImports(): string[] {
    const baseImports = super.getImports();
    const imports = [];
    const hasOperations = this._collectedOperations.length > 0;

    if (!hasOperations) {
      return baseImports;
    }

    imports.push(`import { useQuery, useLazyQuery } from '@mntm/graphql';`);

    return [...baseImports, ...imports];
  }

  private _buildHooks(
    node: OperationDefinitionNode,
    rawOperationType: string,
    documentVariableName: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    const operationType = pascalCase(rawOperationType);

    const operationName: string = this.convertName(node.name?.value ?? '', {
      suffix: this.config.omitOperationSuffix ? '' : operationType,
      useTypesPrefix: false
    });

    if (operationType === 'Mutation') {
      return `
export const use${operationName} = ${this._pureComment}() => {
  return useLazyQuery<${operationResultType}, ${operationVariablesTypes}>(${documentVariableName});
};
`;
    }

    if (operationType === 'Query') {
      return `
export const use${operationName} = ${this._pureComment}(variables: ${operationVariablesTypes} = {} as ${operationVariablesTypes}) => {
  return useQuery<${operationResultType}, ${operationVariablesTypes}>(${documentVariableName}, variables);
};
export const useLazy${operationName} = ${this._pureComment}() => {
  return useLazyQuery<${operationResultType}, ${operationVariablesTypes}>(${documentVariableName});
};
`;
    }

    throw new Error(`${operationType} is not yet supported`);
  }

  protected buildOperation(
    node: OperationDefinitionNode,
    documentVariableName: string,
    operationType: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    return this._buildHooks(node, operationType, documentVariableName, operationResultType, operationVariablesTypes);
  }
}
