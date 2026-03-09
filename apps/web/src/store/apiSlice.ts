import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  CreateGameRequest,
  CreateGameResponse,
  JoinGameRequest,
  GameResponse,
  ResolveInviteResponse,
  GameListResponse,
  SaveAnalysisRequest,
  SaveAnalysisResponse,
  GetAnalysisResponse,
} from "@chess/shared";

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "include",
  }),
  tagTypes: ["Game", "Me"],
  endpoints: (builder) => ({
    // Auth endpoints
    register: builder.mutation<AuthResponse, RegisterRequest>({
      query: (body) => ({
        url: "/auth/register",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Me"],
    }),
    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (body) => ({
        url: "/auth/login",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Me"],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({
        url: "/auth/logout",
        method: "POST",
      }),
      invalidatesTags: ["Me"],
    }),
    getMe: builder.query<AuthResponse, void>({
      query: () => "/auth/me",
      providesTags: ["Me"],
    }),

    // Game endpoints
    createGame: builder.mutation<CreateGameResponse, CreateGameRequest>({
      query: (body) => ({
        url: "/games",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Game"],
    }),
    getGame: builder.query<GameResponse, number>({
      query: (id) => `/games/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Game", id }],
    }),
    resolveInvite: builder.query<ResolveInviteResponse, string>({
      query: (inviteToken) => `/games/resolve/${inviteToken}`,
    }),
    getMyGames: builder.query<GameListResponse, void>({
      query: () => "/games",
      providesTags: ["Game"],
    }),
    joinGame: builder.mutation<GameResponse, { gameId: number; inviteToken: string }>({
      query: ({ gameId, inviteToken }) => ({
        url: `/games/${gameId}/join`,
        method: "POST",
        body: { inviteToken } satisfies JoinGameRequest,
      }),
      invalidatesTags: ["Game"],
    }),

    // Analysis endpoints
    saveAnalysis: builder.mutation<
      SaveAnalysisResponse,
      { gameId: number; body: SaveAnalysisRequest }
    >({
      query: ({ gameId, body }) => ({
        url: `/games/${gameId}/analysis`,
        method: "POST",
        body,
      }),
    }),
    getAnalysis: builder.query<GetAnalysisResponse | null, number>({
      queryFn: async (gameId, _queryApi, _extraOptions, baseQuery) => {
        const result = await baseQuery(`/games/${gameId}/analysis`);
        if (result.error) {
          if (result.error.status === 404) {
            return { data: null };
          }
          return { error: result.error };
        }
        return { data: result.data as GetAnalysisResponse };
      },
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useLogoutMutation,
  useGetMeQuery,
  useCreateGameMutation,
  useGetGameQuery,
  useResolveInviteQuery,
  useGetMyGamesQuery,
  useJoinGameMutation,
  useSaveAnalysisMutation,
  useGetAnalysisQuery,
} = apiSlice;
