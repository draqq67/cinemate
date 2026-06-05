import client from './client';

export const getAdminStats    = ()          => client.get('/admin/stats');
export const getAdminMovies   = (params)    => client.get('/admin/movies', { params });
export const linkJellyfin     = (tmdbId, jellyfinId) => client.put(`/admin/movies/${tmdbId}/jellyfin`, { jellyfinId });
export const unlinkJellyfin   = (tmdbId)   => client.delete(`/admin/movies/${tmdbId}/jellyfin`);
export const getJellyfinLib   = (search)   => client.get('/admin/jellyfin/library', { params: { search } });
export const getAdminComments = (params)   => client.get('/admin/comments', { params });
export const deleteComment    = (id)       => client.delete(`/admin/comments/${id}`);
export const getAdminUsers    = (params)   => client.get('/admin/users', { params });
export const setUserRole      = (id, role) => client.put(`/admin/users/${id}/role`, { role });
export const deleteUser       = (id)       => client.delete(`/admin/users/${id}`);
export const getAdminSubs     = (params)   => client.get('/admin/subtitles', { params });
export const deleteSubtitle   = (id)       => client.delete(`/admin/subtitles/${id}`);

export const uploadAdminSubtitle = (tmdbId, content, language, label) =>
  client.post(`/admin/movies/${tmdbId}/subtitle`, { content, language, label });

export const uploadVideo = (tmdbId, file, onProgress) => {
  const form = new FormData();
  form.append('video', file);
  return client.post(`/admin/movies/${tmdbId}/upload-video`, form, {
    timeout: 0,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
};
