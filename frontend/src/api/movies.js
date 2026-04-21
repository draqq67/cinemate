import client from './client';

export const getMovies = (params) => client.get('/movies', { params });
export const getGenres = () => client.get('/movies/genres');
export const getMovie = (tmdbId) => client.get(`/movies/${tmdbId}`);
export const rateMovie = (tmdbId, score) => client.post(`/movies/${tmdbId}/rate`, { score });
export const getMyRating = (tmdbId) => client.get(`/movies/${tmdbId}/my-rating`);
export const postComment = (tmdbId, body, parent_id) => client.post(`/movies/${tmdbId}/comments`, { body, parent_id });
export const toggleWatchlist = (tmdbId) => client.post(`/movies/${tmdbId}/watchlist`);
export const getWatchlistStatus = (tmdbId) => client.get(`/movies/${tmdbId}/watchlist`);