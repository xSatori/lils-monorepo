/* eslint-disable */
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';

export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };

/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigInt: { input: string; output: string; }
};

export enum OrderDirection {
  Asc = 'asc',
  Desc = 'desc'
}

export type NounWhereInput = {
  id?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  owner?: InputMaybe<Scalars['String']['input']>;
  owner_in?: InputMaybe<Array<Scalars['String']['input']>>;
  owner_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  delegate?: InputMaybe<Scalars['String']['input']>;
  delegate_in?: InputMaybe<Array<Scalars['String']['input']>>;
  background?: InputMaybe<Scalars['Int']['input']>;
  background_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  body?: InputMaybe<Scalars['Int']['input']>;
  body_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  accessory?: InputMaybe<Scalars['Int']['input']>;
  accessory_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  head?: InputMaybe<Scalars['Int']['input']>;
  head_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  glasses?: InputMaybe<Scalars['Int']['input']>;
  glasses_in?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type VrgdaPoolSeedWhereInput = {
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  isUsed?: InputMaybe<Scalars['Boolean']['input']>;
  background?: InputMaybe<Scalars['Int']['input']>;
  background_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  body?: InputMaybe<Scalars['Int']['input']>;
  body_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  accessory?: InputMaybe<Scalars['Int']['input']>;
  accessory_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  head?: InputMaybe<Scalars['Int']['input']>;
  head_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  glasses?: InputMaybe<Scalars['Int']['input']>;
  glasses_in?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type Query = {
  __typename?: 'Query';
  nouns: NounConnection;
  noun?: Maybe<Noun>;
  vrgdaPoolSeeds: VrgdaPoolSeedConnection;
  vrgdaPoolSeed?: Maybe<VrgdaPoolSeed>;
  _meta: _Meta;
};

export type QueryNounsArgs = {
  where?: InputMaybe<NounWhereInput>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<OrderDirection>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryNounArgs = {
  id: Scalars['String']['input'];
};

export type QueryVrgdaPoolSeedsArgs = {
  where?: InputMaybe<VrgdaPoolSeedWhereInput>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<OrderDirection>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryVrgdaPoolSeedArgs = {
  blockNumber: Scalars['BigInt']['input'];
};

export type NounConnection = {
  __typename?: 'NounConnection';
  items: Array<Noun>;
  pageInfo: PageInfo;
};

export type Noun = {
  __typename?: 'Noun';
  id: Scalars['String']['output'];
  owner: Scalars['String']['output'];
  delegate?: Maybe<Scalars['String']['output']>;
  background: Scalars['Int']['output'];
  body: Scalars['Int']['output'];
  accessory: Scalars['Int']['output'];
  head: Scalars['Int']['output'];
  glasses: Scalars['Int']['output'];
  createdAt: Scalars['BigInt']['output'];
  updatedAt: Scalars['BigInt']['output'];
};

export type VrgdaPoolSeedConnection = {
  __typename?: 'VrgdaPoolSeedConnection';
  items: Array<VrgdaPoolSeed>;
  pageInfo: PageInfo;
};

export type VrgdaPoolSeed = {
  __typename?: 'VrgdaPoolSeed';
  id: Scalars['String']['output'];
  blockNumber: Scalars['BigInt']['output'];
  nounId: Scalars['String']['output'];
  background: Scalars['Int']['output'];
  body: Scalars['Int']['output'];
  accessory: Scalars['Int']['output'];
  head: Scalars['Int']['output'];
  glasses: Scalars['Int']['output'];
  isUsed: Scalars['Boolean']['output'];
  generatedAt: Scalars['BigInt']['output'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
};

export type _Meta = {
  __typename?: '_Meta';
  block: _Block;
};

export type _Block = {
  __typename?: '_Block';
  number: Scalars['BigInt']['output'];
  timestamp: Scalars['BigInt']['output'];
};

// GraphQL operations
export type GetNounByIdQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetNounByIdQuery = {
  __typename?: 'Query';
  noun?: {
    __typename?: 'Noun';
    id: string;
    owner: string;
    delegate?: string | null;
    background: number;
    body: number;
    accessory: number;
    head: number;
    glasses: number;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type GetNounsPaginatedQueryVariables = Exact<{
  where?: InputMaybe<NounWhereInput>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<OrderDirection>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetNounsPaginatedQuery = {
  __typename?: 'Query';
  nouns: {
    __typename?: 'NounConnection';
    pageInfo: {
      __typename?: 'PageInfo';
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    items: Array<{
      __typename?: 'Noun';
      id: string;
      owner: string;
      delegate?: string | null;
      background: number;
      body: number;
      accessory: number;
      head: number;
      glasses: number;
      createdAt: string;
      updatedAt: string;
    }>;
  };
};

export type GetVrgdaPoolSeedsQueryVariables = Exact<{
  where?: InputMaybe<VrgdaPoolSeedWhereInput>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<OrderDirection>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetVrgdaPoolSeedsQuery = {
  __typename?: 'Query';
  vrgdaPoolSeeds: {
    __typename?: 'VrgdaPoolSeedConnection';
    pageInfo: {
      __typename?: 'PageInfo';
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    items: Array<{
      __typename?: 'VrgdaPoolSeed';
      id: string;
      blockNumber: string;
      nounId: string;
      background: number;
      body: number;
      accessory: number;
      head: number;
      glasses: number;
      isUsed: boolean;
      generatedAt: string;
    }>;
  };
};

export type GetVrgdaPoolSeedByBlockQueryVariables = Exact<{
  blockNumber: Scalars['BigInt']['input'];
}>;

export type GetVrgdaPoolSeedByBlockQuery = {
  __typename?: 'Query';
  vrgdaPoolSeed?: {
    __typename?: 'VrgdaPoolSeed';
    id: string;
    blockNumber: string;
    nounId: string;
    background: number;
    body: number;
    accessory: number;
    head: number;
    glasses: number;
    isUsed: boolean;
    generatedAt: string;
  } | null;
};

export type GetLatestVrgdaPoolStatusQueryVariables = Exact<{ [key: string]: never; }>;

export type GetLatestVrgdaPoolStatusQuery = {
  __typename?: 'Query';
  _meta: {
    __typename?: '_Meta';
    block: {
      __typename?: '_Block';
      number: string;
      timestamp: string;
    };
  };
  vrgdaPoolSeeds: {
    __typename?: 'VrgdaPoolSeedConnection';
    items: Array<{
      __typename?: 'VrgdaPoolSeed';
      blockNumber: string;
      isUsed: boolean;
    }>;
  };
};

export const GetNounByIdDocument = /*#__PURE__*/ `
    query GetNounById($id: String!) {
  noun(id: $id) {
    id
    owner
    delegate
    background
    body
    accessory
    head
    glasses
    createdAt
    updatedAt
  }
}
    ` as unknown as DocumentTypeDecoration<GetNounByIdQuery, GetNounByIdQueryVariables>;

export const GetNounsPaginatedDocument = /*#__PURE__*/ `
    query GetNounsPaginated($where: NounWhereInput, $orderBy: String, $orderDirection: OrderDirection, $limit: Int, $offset: Int) {
  nouns(where: $where, orderBy: $orderBy, orderDirection: $orderDirection, limit: $limit, offset: $offset) {
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
    items {
      id
      owner
      delegate
      background
      body
      accessory
      head
      glasses
      createdAt
      updatedAt
    }
  }
}
    ` as unknown as DocumentTypeDecoration<GetNounsPaginatedQuery, GetNounsPaginatedQueryVariables>;

export const GetVrgdaPoolSeedsDocument = /*#__PURE__*/ `
    query GetVrgdaPoolSeeds($where: VrgdaPoolSeedWhereInput, $orderBy: String, $orderDirection: OrderDirection, $limit: Int, $offset: Int) {
  vrgdaPoolSeeds(where: $where, orderBy: $orderBy, orderDirection: $orderDirection, limit: $limit, offset: $offset) {
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
    items {
      id
      blockNumber
      nounId
      background
      body
      accessory
      head
      glasses
      isUsed
      generatedAt
    }
  }
}
    ` as unknown as DocumentTypeDecoration<GetVrgdaPoolSeedsQuery, GetVrgdaPoolSeedsQueryVariables>;

export const GetVrgdaPoolSeedByBlockDocument = /*#__PURE__*/ `
    query GetVrgdaPoolSeedByBlock($blockNumber: BigInt!) {
  vrgdaPoolSeed(blockNumber: $blockNumber) {
    id
    blockNumber
    nounId
    background
    body
    accessory
    head
    glasses
    isUsed
    generatedAt
  }
}
    ` as unknown as DocumentTypeDecoration<GetVrgdaPoolSeedByBlockQuery, GetVrgdaPoolSeedByBlockQueryVariables>;

export const GetLatestVrgdaPoolStatusDocument = /*#__PURE__*/ `
    query GetLatestVrgdaPoolStatus {
  _meta {
    block {
      number
      timestamp
    }
  }
  vrgdaPoolSeeds(limit: 1, orderBy: "blockNumber", orderDirection: desc) {
    items {
      blockNumber
      isUsed
    }
  }
}
    ` as unknown as DocumentTypeDecoration<GetLatestVrgdaPoolStatusQuery, GetLatestVrgdaPoolStatusQueryVariables>;
