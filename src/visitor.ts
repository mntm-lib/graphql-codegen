import type {
  LoadedFragment
} from '@graphql-codegen/visitor-plugin-common';

import type {
  OperationDefinitionNode,
  FragmentDefinitionNode,
  GraphQLSchema
} from 'graphql';

import type {
  MNTMGraphQLRawPluginConfig,
  MNTMGraphQLPluginConfig
} from './config';

import {
  print
} from 'graphql';

import {
  ClientSideBaseVisitor,
  getConfigValue,
  OMIT_TYPE
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

export class MNTMGraphQLVisitor extends ClientSideBaseVisitor<MNTMGraphQLRawPluginConfig, MNTMGraphQLPluginConfig> {
  private _pureComment: string;

  constructor(schema: GraphQLSchema, fragments: LoadedFragment[], rawConfig: MNTMGraphQLRawPluginConfig) {
    super(schema, fragments, rawConfig, {
      withHooks: getConfigValue(rawConfig.withHooks, true),
      withRequests: getConfigValue(rawConfig.withRequests, false)
    });
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

    imports.push(OMIT_TYPE);

    const importNames = [];

    if (this.config.withHooks) {
      importNames.push('useQuery');
      importNames.push('useLazyQuery');
    }

    if (this.config.withRequests) {
      importNames.push('gqlRequest');
    }

    if (importNames.length !== 0) {
      imports.push(`import { ${importNames.join(', ')} } from '@mntm/graphql';`);
    }

    return [...baseImports, ...imports];
  }

  private _resolveType(rawOperationType: string): string {
    return pascalCase(rawOperationType);
  }

  private _resolveName(operationType: string, name?: string): string {
    return this.convertName(name || '', {
      suffix: this.config.omitOperationSuffix ? '' : operationType,
      useTypesPrefix: false
    });
  }

  private _buildHooks(
    node: OperationDefinitionNode,
    rawOperationType: string,
    documentVariableName: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    const operationType = this._resolveType(rawOperationType);
    const operationName = this._resolveName(operationType, node.name?.value);

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

  private _buildRequests(
    node: OperationDefinitionNode,
    rawOperationType: string,
    documentVariableName: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    const operationType = this._resolveType(rawOperationType);
    const operationName = this._resolveName(operationType, node.name?.value);

    if (operationType === 'Mutation' || operationType === 'Query') {
      return `
export const request${operationName} = ${this._pureComment}(variables: ${operationVariablesTypes} = {} as ${operationVariablesTypes}) => {
  return gqlRequest<${operationResultType}>(${documentVariableName}, variables);
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
    let operation = '';

    operation += this.config.withHooks ?
      this._buildHooks(node, operationType, documentVariableName, operationResultType, operationVariablesTypes) :
      '';

    operation += this.config.withRequests ?
      this._buildRequests(node, operationType, documentVariableName, operationResultType, operationVariablesTypes) :
      '';

    return operation;
  }
}
