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

export class MNTMGraphQLVisitor extends ClientSideBaseVisitor<MNTMGraphQLRawPluginConfig, MNTMGraphQLPluginConfig> {
  private readonly _pureComment: string;

  public constructor(schema: GraphQLSchema, fragments: LoadedFragment[], rawConfig: MNTMGraphQLRawPluginConfig) {
    super(schema, fragments, rawConfig, {
      withHooks: getConfigValue(rawConfig.withHooks, true),
      withRequests: getConfigValue(rawConfig.withRequests, false),
      withSWR: getConfigValue(rawConfig.withSWR, false)
    });

    autoBind(this);

    this._pureComment = rawConfig.pureMagicComment ? '/*#__PURE__*/' : '';
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

    const importNames: string[] = [];

    if (this.config.withHooks) {
      importNames.push('useQuery');
      importNames.push('useLazyQuery');
    }

    if (this.config.withRequests || this.config.withSWR) {
      importNames.push('gqlRequest');
    }

    if (importNames.length > 0) {
      imports.push(`import { ${importNames.join(', ')} } from '@mntm/graphql';`);
    }

    if (this.config.withSWR) {
      imports.push(`import type { BareFetcher, SWRConfiguration, SWRResponse } from 'swr';`);
      imports.push(`import { default as useSWR } from 'swr';`);
      imports.push(`type SWRDispatchResponse<D, E, V> = Omit<SWRResponse<D, E>, 'data'> & {
  data: D | null;
  dispatch: (variables?: V) => Promise<D>;
};`);
      imports.push(`const unstable_SWRDispatchCompare = ${this._pureComment}() => false;`);
      imports.push(`const unstable_SWRDispatchConfig = {
  revalidateIfStale: false,
  revalidateOnFocus: false,
  revalidateOnMount: false,
  revalidateOnReconnect: false,
  fallbackData: null,
  compare: unstable_SWRDispatchCompare
} as const;`);
      imports.push(`const unstable_useSWRDispatch = ${this._pureComment}<M, V>(bare: BareFetcher<M>, config: Partial<SWRConfiguration<M, Error, BareFetcher<M>>> = {}) => {
  const swr = useSWR<M, Error>({}, bare, Object.assign({}, unstable_SWRDispatchConfig, config)) as SWRDispatchResponse<M, Error, V>;

  swr.dispatch = async (variables: V = {} as V) => swr.mutate(bare(variables)) as Promise<M>;

  return swr;
};`);
    }

    return imports;
  }

  private readonly _resolveType = pascalCase;

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

  private _buildSWR(
    node: OperationDefinitionNode,
    rawOperationType: string,
    documentVariableName: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    const operationType = this._resolveType(rawOperationType);
    const operationName = this._resolveName(operationType, node.name?.value);

    if (operationType === 'Query') {
      return `
const fetch${operationName} = ${this._pureComment}(variables: ${operationVariablesTypes} = {} as ${operationVariablesTypes}) => {
  return gqlRequest<${operationResultType}>(${documentVariableName}, variables);
};
export const useSWR${operationName} = ${this._pureComment}(variables: ${operationVariablesTypes} = {} as ${operationVariablesTypes}, config: Partial<SWRConfiguration<${operationResultType}, Error, BareFetcher<${operationResultType}>>> = {}) => {
  return useSWR<${operationResultType}, Error>(variables, fetch${operationName}, config);
};
`;
    }

    if (operationType === 'Mutation') {
      return `
const fetch${operationName} = ${this._pureComment}(variables: ${operationVariablesTypes} = {} as ${operationVariablesTypes}) => {
  return gqlRequest<${operationResultType}>(${documentVariableName}, variables);
};
export const useSWR${operationName} = ${this._pureComment}(config: Partial<SWRConfiguration<${operationResultType}, Error, BareFetcher<${operationResultType}>>> = {}) => {
  return unstable_useSWRDispatch<${operationResultType}, ${operationVariablesTypes}>(fetch${operationName}, config);
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

    if (this.config.withHooks) {
      operation += this._buildHooks(
        node,
        operationType,
        documentVariableName,
        operationResultType,
        operationVariablesTypes
      );
    }

    if (this.config.withRequests) {
      operation += this._buildRequests(
        node,
        operationType,
        documentVariableName,
        operationResultType,
        operationVariablesTypes
      );
    }

    if (this.config.withSWR) {
      operation += this._buildSWR(
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
