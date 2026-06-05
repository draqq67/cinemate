import client from './client';

export const getMovies = (params) => client.get('/movies', { params });
export const getGenres = () => client.get('/movies/genres');
export const getMovie = (tmdbId) => client.get(`/movies/${tmdbId}`);
export const rateMovie = (tmdbId, score) => client.post(`/movies/${tmdbId}/rate`, { score });
export const getMyRating = (tmdbId) => client.get(`/movies/${tmdbId}/my-rating`);
export const postComment = (tmdbId, body, parent_id) => client.post(`/movies/${tmdbId}/comments`, { body, parent_id });
export const toggleWatchlist = (tmdbId) => client.post(`/movies/${tmdbId}/watchlist`);
export const getWatchlistStatus = (tmdbId) => client.get(`/movies/${tmdbId}/watchlist`);
export const getStreamUrl      = (tmdbId) => client.get(`/movies/${tmdbId}/stream-url`);
export const getUserSubtitles  = (tmdbId) => client.get(`/movies/${tmdbId}/user-subtitles`);
export const uploadSubtitle    = (tmdbId, content, language, label) =>
  client.post(`/movies/${tmdbId}/subtitle`, { content, language, label });
export const getStreamableMovies = (sort = 'popularity', limit = 12) =>
  client.get('/movies', { params: { streamable: 'true', sort, limit } });
export const getRecommendations = ()        => client.get('/recommendations');
export const getSimilarMovies   = (tmdbId)  => client.get(`/recommendations/similar/${tmdbId}`);
export const searchTmdb         = (q, page) => client.get('/movies/search/tmdb', { params: { q, page } });