import type {
  ClientSideBasePluginConfig,
  RawClientSideBasePluginConfig
} from '@graphql-codegen/visitor-plugin-common';

/**
 * @description [graphql-codegen](https://github.com/dotansimha/graphql-code-generator) plugin that generates hooks with TypeScript typings.
 */
export type MNTMGraphQLRawPluginConfig = {
  /**
   * @description Customized the output by enabling/disabling the generated requests.
   * @default false
   */
  withRequests?: boolean;
  /**
   * @description Customized the output by enabling/disabling the generated useSWR Hooks.
   * @default true
   */
  withHooks?: boolean;
  /**
   * @description Customized the output by enabling/disabling the generated useSWR Hooks.
   * @default true
   * @deprecated use withHooks
   */
  withSWR?: boolean;
} & RawClientSideBasePluginConfig;

export type MNTMGraphQLPluginConfig = {
  withRequests: boolean;
  withHooks: boolean;
  withSWR: boolean;
} & ClientSideBasePluginConfig;
