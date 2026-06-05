import client from './client';

export const importCSV = (file, onUploadProgress) => {
  const fd = new FormData();
  fd.append('file', file);
  return client.post('/import', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
    timeout: 180_000, // 3 min — large files with many TMDB lookups can be slow
  }).then(r => r.data);
};
