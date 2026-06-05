import client from './client';

export const getLists      = (params)       => client.get('/lists', { params });
export const getMyLists    = ()             => client.get('/lists/mine');
export const getList       = (id)           => client.get(`/lists/${id}`);
export const createList    = (data)         => client.post('/lists', data);
export const updateList    = (id, data)     => client.put(`/lists/${id}`, data);
export const deleteList    = (id)           => client.delete(`/lists/${id}`);
export const addToList     = (id, tmdbId)   => client.post(`/lists/${id}/movies`, { tmdbId });
export const removeFromList = (id, tmdbId)  => client.delete(`/lists/${id}/movies/${tmdbId}`);
export const toggleFollowList = (id)        => client.post(`/lists/${id}/follow`);
export const getListFollowStatus = (id)     => client.get(`/lists/${id}/follow`);
