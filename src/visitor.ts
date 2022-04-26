import type {
  LoadedFragment
} from '@graphql-codegen/visitor-plugin-common';

import type {
  FragmentDefinitionNode,
  GraphQLSchema,
  OperationDefinitionNode
} from 'graphql';

import type {
  MNTMGraphQLPluginConfig,
  MNTMGraphQLRawPluginConfig
} from './config';

import {
  print,
  stripIgnoredCharacters
} from 'graphql';

import {
  ClientSideBaseVisitor,
  getConfigValue
} from '@graphql-codegen/visitor-plugin-common';

import {
  default as autoBind
} from 'auto-bind';

import {
  pascalCase
} from 'change-case-all';

const EMPTY = '';

export class MNTMGraphQLVisitor extends ClientSideBaseVisitor<MNTMGraphQLRawPluginConfig, MNTMGraphQLPluginConfig> {
  private readonly _pureComment: string;

  public constructor(schema: GraphQLSchema, fragments: LoadedFragment[], rawConfig: MNTMGraphQLRawPluginConfig) {
    super(schema, fragments, rawConfig, {
      withHooks: getConfigValue(rawConfig.withHooks, true),
      withRequests: getConfigValue(rawConfig.withRequests, false),
      withSWR: getConfigValue(rawConfig.withSWR, false)
    });

    autoBind(this);

    this._pureComment = rawConfig.pureMagicComment ? '/*#__PURE__*/' : EMPTY;
  }

  protected _gql(node: FragmentDefinitionNode | OperationDefinitionNode): string {
    const fragments = this._transformFragments(node);

    let doc = print(node);

    // Fix escaped
    doc = doc.replace(/\\\\/g, '\\\\');

    if (this.config.optimizeDocumentNode) {
      // Specification minify
      doc = stripIgnoredCharacters(doc);

      // Fix unnecessary space around doc
      doc = doc.trim();
    }

    // Add fragments
    doc += this._includeFragments(fragments, node.kind);

    // Finalize
    doc = this._prepareDocument(doc);

    return `\`${doc}\``;
  }

  public getImports(): string[] {
    const imports = super.getImports();

    const hasOperations = this._collectedOperations.length > 0;

    if (!hasOperations) {
      return imports;
    }

    if (this.config.withHooks || this.config.withSWR) {
      imports.push(`
import type { BareFetcher, SWRConfiguration } from 'swr';
import type { SWRMutationConfiguration } from 'swr/mutation';
import type { GraphQLVariables, GraphQLError } from '@mntm/graphql-request';

import { default as useSWR } from 'swr';
import { default as useSWRMutation } from 'swr/mutation';
import { gqlRequest } from '@mntm/graphql-request';

type IFetcherOptions = {
  n: string;
  v: GraphQLVariables;
};

type ITriggerOptions<T> = {
  arg: T;
};

const fetcher = ${this._pureComment}<T>(query: string, options: IFetcherOptions) => gqlRequest<T>(query, options.v, options.n);
`);
    } else if (this.config.withRequests) {
      imports.push(`
import { gqlRequest } from '@mntm/graphql-request';
`);
    }

    return imports;
  }

  private readonly _resolveType = pascalCase;

  private _resolveName(operationType: string, name: string): string {
    return this.convertName(name, {
      suffix: this.config.omitOperationSuffix ? '' : operationType,
      useTypesPrefix: false
    });
  }

  private _buildRequests(
    node: OperationDefinitionNode,
    rawOperationType: string,
    documentVariableName: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    const name = (node.name && node.name.value) || EMPTY;

    if (name === EMPTY) {
      return EMPTY;
    }

    const operationType = this._resolveType(rawOperationType);
    const operationName = this._resolveName(operationType, name);

    if (operationType === 'Mutation' || operationType === 'Query') {
      return `
export const request${operationName} = ${this._pureComment}(variables: ${operationVariablesTypes} = {} as ${operationVariablesTypes}) => {
  return gqlRequest<${operationResultType}>(${documentVariableName}, variables, ${name});
};
`;
    }

    throw new Error(`${operationType} is not yet supported`);
  }

  private _buildHooks(
    node: OperationDefinitionNode,
    rawOperationType: string,
    documentVariableName: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    const name = (node.name && node.name.value) || EMPTY;

    if (name === EMPTY) {
      return EMPTY;
    }

    const operationType = this._resolveType(rawOperationType);
    const operationName = this._resolveName(operationType, name);

    if (operationType === 'Query') {
      return `
const fetch${operationName} = (options: IFetcherOptions) => fetcher<${operationResultType}>(${documentVariableName}, options);

export const use${operationName} = ${this._pureComment}(variables: ${operationVariablesTypes} = {} as ${operationVariablesTypes}, config: Partial<SWRConfiguration<${operationResultType}, GraphQLError[], BareFetcher<${operationResultType}>>> = {}) => {
  return useSWR<${operationResultType}, GraphQLError[], IFetcherOptions>({ n: '${name}', v: variables }, fetch${operationName}, config);
};
`;
    }

    if (operationType === 'Mutation') {
      return `
const trigger${operationName} = (name: string, options: ITriggerOptions<${operationVariablesTypes}>) => fetcher<${operationResultType}>(${documentVariableName}, { n: name, v: options.arg });

export const use${operationName} = ${this._pureComment}(config: Partial<SWRMutationConfiguration<${operationResultType}, GraphQLError[], ${operationVariablesTypes}, string>> = {}) => {
  return useSWRMutation<${operationResultType}, GraphQLError[], string, ${operationVariablesTypes}>('${name}', trigger${operationName}, config);
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

    if (this.config.withRequests) {
      operation += this._buildRequests(
        node,
        operationType,
        documentVariableName,
        operationResultType,
        operationVariablesTypes
      );
    }

    if (this.config.withHooks || this.config.withSWR) {
      operation += this._buildHooks(
        node,
        operationType,
        documentVariableName,
        operationResultType,
        operationVariablesTypes
      );
    }

    return operation;
  }
}
