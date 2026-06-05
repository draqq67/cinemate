import { Router } from 'express';

const router = Router();
const TMDB_BASE = 'https://api.themoviedb.org/3';
const tmdbHeaders = () => ({ Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` });

async function tmdbGet(path) {
  const res = await fetch(`${TMDB_BASE}${path}`, { headers: tmdbHeaders() });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

// ── GET /api/people/:personId ─────────────────────────────────────────────────
router.get('/:personId', async (req, res) => {
  try {
    const id = parseInt(req.params.personId);
    if (!id) return res.status(400).json({ error: 'Invalid person ID' });

    const [details, credits, images] = await Promise.all([
      tmdbGet(`/person/${id}`),
      tmdbGet(`/person/${id}/combined_credits`),
      tmdbGet(`/person/${id}/images`),
    ]);

    const movies = (credits.cast || [])
      .filter(c => c.media_type === 'movie' && c.poster_path)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 40)
      .map(c => ({
        tmdb_id:      c.id,
        title:        c.title,
        poster_path:  c.poster_path,
        character:    c.character,
        release_date: c.release_date,
        vote_average: c.vote_average,
      }));

    const directed = (credits.crew || [])
      .filter(c => c.media_type === 'movie' && c.job === 'Director' && c.poster_path)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 20)
      .map(c => ({
        tmdb_id:      c.id,
        title:        c.title,
        poster_path:  c.poster_path,
        release_date: c.release_date,
        vote_average: c.vote_average,
      }));

    res.json({
      id:           details.id,
      name:         details.name,
      biography:    details.biography,
      birthday:     details.birthday,
      deathday:     details.deathday,
      place_of_birth: details.place_of_birth,
      profile_path: details.profile_path,
      known_for_department: details.known_for_department,
      popularity:   details.popularity,
      photos:       (images.profiles || []).slice(0, 8).map(p => p.file_path),
      movies,
      directed,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Could not fetch person data' });
  }
});

export default router;
