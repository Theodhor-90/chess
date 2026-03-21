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
  UserPreferences,
  UserPreferencesResponse,
  BotGameRequest,
  BotGameResponse,
  ExplorerResponse,
  ExplorerPlayerResponse,
  ExplorerEngineResponse,
  RatingBracket,
  SpeedCategory,
  RepertoireListItem,
  RepertoireTree,
  CreateRepertoireRequest,
  CreateRepertoireResponse,
  UpdateRepertoireRequest,
  AddRepertoireMoveResponse,
  DeleteRepertoireMoveResponse,
  RepertoireImportResponse,
  RepertoireExportResponse,
  TrainingNextResponse,
  TrainingReviewRequest,
  TrainingReviewResponse,
  TrainingStatsResponse,
  TrainingDashboardResponse,
  DifficultPositionsResponse,
} from "@chess/shared";

export interface ExplorerMastersArgs {
  fen: string;
  since?: string;
  until?: string;
}

export interface ExplorerPlatformArgs {
  fen: string;
  ratings?: RatingBracket[];
  speeds?: SpeedCategory[];
  since?: string;
  until?: string;
}

export interface ExplorerPlayerArgs {
  fen: string;
  userId: number;
  color: "white" | "black";
  speeds?: SpeedCategory[];
  since?: string;
  until?: string;
}

export interface ExplorerEngineArgs {
  fen: string;
  depth?: number;
}

export interface ExplorerPersonalArgs {
  fen: string;
  color: "white" | "black";
  speeds?: SpeedCategory[];
  since?: string;
  until?: string;
}

export interface AddRepertoireMoveArgs {
  repertoireId: number;
  positionFen: string;
  moveSan: string;
  isMainLine?: boolean;
  comment?: string;
}

export interface UpdateRepertoireMoveArgs {
  repertoireId: number;
  moveId: number;
  isMainLine?: boolean;
  comment?: string;
  sortOrder?: number;
}

export interface DeleteRepertoireMoveArgs {
  repertoireId: number;
  moveId: number;
}

export interface ImportRepertoirePgnArgs {
  repertoireId: number;
  pgn: string;
}

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "include",
  }),
  tagTypes: [
    "Game",
    "Me",
    "Repertoires",
    "Repertoire",
    "TrainingNext",
    "TrainingStats",
    "TrainingDashboard",
  ],
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

    // Preferences endpoints
    getPreferences: builder.query<UserPreferencesResponse, void>({
      query: () => "/users/me/preferences",
    }),
    updatePreferences: builder.mutation<UserPreferencesResponse, UserPreferences>({
      query: (preferences) => ({
        url: "/users/me/preferences",
        method: "PUT",
        body: { preferences },
      }),
    }),
    createBotGame: builder.mutation<BotGameResponse, BotGameRequest>({
      query: (body) => ({
        url: "/games/bot",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Game"],
    }),
    getExplorerMasters: builder.query<ExplorerResponse, ExplorerMastersArgs>({
      query: ({ fen, since, until }) => {
        const params = new URLSearchParams();
        params.set("fen", fen);
        if (since) params.set("since", since);
        if (until) params.set("until", until);
        return `/explorer/masters?${params.toString()}`;
      },
    }),
    getExplorerPlatform: builder.query<ExplorerResponse, ExplorerPlatformArgs>({
      query: ({ fen, ratings, speeds, since, until }) => {
        const params = new URLSearchParams();
        params.set("fen", fen);
        if (ratings && ratings.length > 0) params.set("ratings", ratings.join(","));
        if (speeds && speeds.length > 0) params.set("speeds", speeds.join(","));
        if (since) params.set("since", since);
        if (until) params.set("until", until);
        return `/explorer/platform?${params.toString()}`;
      },
    }),
    getExplorerPlayer: builder.query<ExplorerPlayerResponse, ExplorerPlayerArgs>({
      query: ({ fen, userId, color, speeds, since, until }) => {
        const params = new URLSearchParams();
        params.set("fen", fen);
        params.set("userId", String(userId));
        params.set("color", color);
        if (speeds && speeds.length > 0) params.set("speeds", speeds.join(","));
        if (since) params.set("since", since);
        if (until) params.set("until", until);
        return `/explorer/player?${params.toString()}`;
      },
    }),
    postExplorerEngine: builder.mutation<ExplorerEngineResponse, ExplorerEngineArgs>({
      query: (body) => ({
        url: "/explorer/engine",
        method: "POST",
        body,
      }),
    }),
    getExplorerPersonal: builder.query<ExplorerResponse, ExplorerPersonalArgs>({
      query: ({ fen, color, speeds, since, until }) => {
        const params = new URLSearchParams();
        params.set("fen", fen);
        params.set("color", color);
        if (speeds && speeds.length > 0) params.set("speeds", speeds.join(","));
        if (since) params.set("since", since);
        if (until) params.set("until", until);
        return `/explorer/personal?${params.toString()}`;
      },
    }),

    // Repertoire endpoints
    getRepertoires: builder.query<RepertoireListItem[], void>({
      query: () => "/repertoires",
      providesTags: ["Repertoires"],
    }),

    getRepertoire: builder.query<RepertoireTree, number>({
      query: (id) => `/repertoires/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Repertoire", id }],
    }),

    createRepertoire: builder.mutation<CreateRepertoireResponse, CreateRepertoireRequest>({
      query: (body) => ({
        url: "/repertoires",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Repertoires"],
    }),

    updateRepertoire: builder.mutation<
      { success: true },
      { id: number; body: UpdateRepertoireRequest }
    >({
      query: ({ id, body }) => ({
        url: `/repertoires/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => ["Repertoires", { type: "Repertoire", id }],
    }),

    deleteRepertoire: builder.mutation<{ success: true }, number>({
      query: (id) => ({
        url: `/repertoires/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Repertoires"],
    }),

    addRepertoireMove: builder.mutation<AddRepertoireMoveResponse, AddRepertoireMoveArgs>({
      query: ({ repertoireId, ...body }) => ({
        url: `/repertoires/${repertoireId}/moves`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { repertoireId }) => [
        "Repertoires",
        { type: "Repertoire", id: repertoireId },
      ],
    }),

    deleteRepertoireMove: builder.mutation<DeleteRepertoireMoveResponse, DeleteRepertoireMoveArgs>({
      query: ({ repertoireId, moveId }) => ({
        url: `/repertoires/${repertoireId}/moves/${moveId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { repertoireId }) => [
        "Repertoires",
        { type: "Repertoire", id: repertoireId },
      ],
    }),

    updateRepertoireMove: builder.mutation<AddRepertoireMoveResponse, UpdateRepertoireMoveArgs>({
      query: ({ repertoireId, moveId, ...body }) => ({
        url: `/repertoires/${repertoireId}/moves/${moveId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { repertoireId }) => [
        "Repertoires",
        { type: "Repertoire", id: repertoireId },
      ],
    }),

    importRepertoirePgn: builder.mutation<RepertoireImportResponse, ImportRepertoirePgnArgs>({
      query: ({ repertoireId, pgn }) => ({
        url: `/repertoires/${repertoireId}/import`,
        method: "POST",
        body: { pgn },
      }),
      invalidatesTags: (_result, _error, { repertoireId }) => [
        "Repertoires",
        { type: "Repertoire", id: repertoireId },
      ],
    }),

    getRepertoireExport: builder.query<RepertoireExportResponse, number>({
      query: (id) => `/repertoires/${id}/export`,
    }),

    // Training endpoints
    getTrainingNext: builder.query<TrainingNextResponse, number>({
      query: (id) => `/repertoires/${id}/train/next`,
      providesTags: (_result, _error, id) => [{ type: "TrainingNext", id }],
    }),

    submitTrainingReview: builder.mutation<
      TrainingReviewResponse,
      { repertoireId: number; body: TrainingReviewRequest }
    >({
      query: ({ repertoireId, body }) => ({
        url: `/repertoires/${repertoireId}/train/review`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { repertoireId }) => [
        { type: "TrainingNext", id: repertoireId },
        { type: "TrainingStats", id: repertoireId },
      ],
    }),

    getTrainingStats: builder.query<TrainingStatsResponse, number>({
      query: (id) => `/repertoires/${id}/train/stats`,
      providesTags: (_result, _error, id) => [{ type: "TrainingStats", id }],
    }),

    getTrainingDashboard: builder.query<TrainingDashboardResponse, void>({
      query: () => "/training/dashboard",
      providesTags: ["TrainingDashboard"],
    }),

    getDifficultPositions: builder.query<DifficultPositionsResponse, void>({
      query: () => "/training/difficult",
      providesTags: ["TrainingDashboard"],
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
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
  useCreateBotGameMutation,
  useGetExplorerMastersQuery,
  useGetExplorerPlatformQuery,
  useGetExplorerPlayerQuery,
  usePostExplorerEngineMutation,
  useGetExplorerPersonalQuery,
  useGetRepertoiresQuery,
  useGetRepertoireQuery,
  useCreateRepertoireMutation,
  useUpdateRepertoireMutation,
  useDeleteRepertoireMutation,
  useAddRepertoireMoveMutation,
  useDeleteRepertoireMoveMutation,
  useUpdateRepertoireMoveMutation,
  useImportRepertoirePgnMutation,
  useGetRepertoireExportQuery,
  useLazyGetRepertoireExportQuery,
  useLazyGetExplorerPlayerQuery,
  useGetTrainingNextQuery,
  useLazyGetTrainingNextQuery,
  useSubmitTrainingReviewMutation,
  useGetTrainingStatsQuery,
  useGetTrainingDashboardQuery,
  useGetDifficultPositionsQuery,
} = apiSlice;
