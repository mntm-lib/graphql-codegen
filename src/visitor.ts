import type {
  ClientSideBasePluginConfig,
  LoadedFragment
} from '@graphql-codegen/visitor-plugin-common';

import type {
  OperationDefinitionNode,
  GraphQLSchema
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
  pascalCase
} from 'change-case-all';

export type MNTMGraphQLPluginConfig = ClientSideBasePluginConfig;

export class MNTMGraphQLVisitor extends ClientSideBaseVisitor<MNTMGraphQLRawPluginConfig, MNTMGraphQLPluginConfig> {
  constructor(schema: GraphQLSchema, fragments: LoadedFragment[], rawConfig: MNTMGraphQLRawPluginConfig) {
    super(schema, fragments, rawConfig, {});
    autoBind(this);
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
    operationType: string,
    documentVariableName: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    const operationName: string = this.convertName(node.name?.value ?? '', {
      suffix: this.config.omitOperationSuffix ? '' : pascalCase(operationType),
      useTypesPrefix: false
    });

    if (operationType === 'Mutation') {
      return `
export function use${operationName}() {
  return useLazyQuery<${operationResultType}, ${operationVariablesTypes}>(${documentVariableName});
};`;
    }

    if (operationType === 'Query') {
      return `
export function use${operationName}(variables: ${operationVariablesTypes} = {} as ${operationVariablesTypes}) {
  return useQuery<${operationResultType}, ${operationVariablesTypes}>(${documentVariableName}, variables);
};`;
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
