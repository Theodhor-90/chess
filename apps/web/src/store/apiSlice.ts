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
  GameHistoryQuery,
  GameHistoryResponse,
  PlayerStatsResponse,
  ServerAnalyzeResponse,
  ServerEvaluateRequest,
  EvaluationResult,
  DatabaseGame,
  DatabaseGamesQuery,
  PaginatedResponse,
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
    getGameHistory: builder.query<GameHistoryResponse, GameHistoryQuery>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.page !== undefined) searchParams.set("page", String(params.page));
        if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
        if (params.result) searchParams.set("result", params.result);
        if (params.sort) searchParams.set("sort", params.sort);
        const qs = searchParams.toString();
        return `/games/history${qs ? `?${qs}` : ""}`;
      },
    }),

    getUserStats: builder.query<PlayerStatsResponse, number>({
      query: (id) => `/users/${id}/stats`,
    }),

    serverAnalyze: builder.mutation<ServerAnalyzeResponse, number>({
      query: (gameId) => ({
        url: `/games/${gameId}/server-analyze`,
        method: "POST",
      }),
    }),

    evaluatePosition: builder.mutation<EvaluationResult, ServerEvaluateRequest>({
      query: (body) => ({
        url: "/engine/evaluate",
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
    getDatabaseGames: builder.query<
      PaginatedResponse<Omit<DatabaseGame, "pgn">>,
      DatabaseGamesQuery
    >({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.page !== undefined) searchParams.set("page", String(params.page));
        if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
        if (params.player) searchParams.set("player", params.player);
        if (params.white) searchParams.set("white", params.white);
        if (params.black) searchParams.set("black", params.black);
        if (params.minElo !== undefined) searchParams.set("minElo", String(params.minElo));
        if (params.maxElo !== undefined) searchParams.set("maxElo", String(params.maxElo));
        if (params.result) searchParams.set("result", params.result);
        if (params.eco) searchParams.set("eco", params.eco);
        if (params.opening) searchParams.set("opening", params.opening);
        if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
        if (params.dateTo) searchParams.set("dateTo", params.dateTo);
        if (params.timeControl) searchParams.set("timeControl", params.timeControl);
        if (params.termination) searchParams.set("termination", params.termination);
        if (params.sort) searchParams.set("sort", params.sort);
        if (params.order) searchParams.set("order", params.order);
        const qs = searchParams.toString();
        return `/database/games${qs ? `?${qs}` : ""}`;
      },
    }),
    getDatabaseGame: builder.query<DatabaseGame, number>({
      query: (id) => `/database/games/${id}`,
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
  useGetGameHistoryQuery,
  useSaveAnalysisMutation,
  useGetAnalysisQuery,
  useGetUserStatsQuery,
  useServerAnalyzeMutation,
  useEvaluatePositionMutation,
  useGetDatabaseGamesQuery,
  useGetDatabaseGameQuery,
} = apiSlice;
