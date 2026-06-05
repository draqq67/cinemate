import client from './client';

export const getFeed         = (params)  => client.get('/activity/feed', { params });
export const getAnalytics    = ()        => client.get('/activity/analytics');
export const toggleFollow    = (userId)  => client.post(`/activity/follow/${userId}`);
export const getFollowStatus = (userId)  => client.get(`/activity/follow/${userId}`);
export const getFollowers    = (userId)  => client.get(`/activity/users/${userId}/followers`);
export const getFollowing    = (userId)  => client.get(`/activity/users/${userId}/following`);
