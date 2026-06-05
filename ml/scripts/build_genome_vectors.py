#!/usr/bin/env python3
"""
Pre-compute genome_vectors.parquet from the ML-25M dataset.
Run once on the host machine (where ML-25M is downloaded):

  python ml/scripts/build_genome_vectors.py
  # or with custom paths:
  python ml/scripts/build_genome_vectors.py \
    --ml25m ml/notebooks/data/ml-25m \
    --out   ml/data/genome_vectors.parquet

The output file is ~60 MB (float32, ~13K movies x 1128 tags).
It is gitignored and must be generated before starting the ml Docker service.
"""
import argparse
import pathlib
import sys

import numpy as np
import pandas as pd


def build(ml25m_dir: pathlib.Path, out_path: pathlib.Path) -> None:
    required = ["genome-scores.csv", "links.csv"]
    for f in required:
        if not (ml25m_dir / f).exists():
            print(f"ERROR: {ml25m_dir / f} not found.")
            print("Download ML-25M from https://grouplens.org/datasets/movielens/25m/")
            sys.exit(1)

    print(f"Reading genome-scores.csv from {ml25m_dir} …")
    g_scores = pd.read_csv(
        ml25m_dir / "genome-scores.csv",
        dtype={"movieId": int, "tagId": int, "relevance": float},
    )
    print(f"  {len(g_scores):>12,} rows  |  {g_scores.movieId.nunique():,} movies")

    print("Reading links.csv …")
    links = pd.read_csv(
        ml25m_dir / "links.csv",
        dtype={"movieId": int, "tmdbId": "Int64"},
    ).dropna(subset=["tmdbId"])
    links["tmdbId"] = links["tmdbId"].astype(int)

    print("Pivoting genome scores (may take ~30s) …")
    genome = g_scores.pivot(index="movieId", columns="tagId", values="relevance")
    genome = genome.astype(np.float32)

    print("Joining with TMDB IDs via links.csv …")
    genome = genome.join(links.set_index("movieId")[["tmdbId"]], how="inner")
    genome = genome.set_index("tmdbId")
    genome.index.name = "tmdb_id"

    # A handful of ML movies share a TMDB ID — keep the first
    dups = genome.index.duplicated(keep="first").sum()
    if dups:
        print(f"  Dropping {dups} duplicate tmdb_id entries")
        genome = genome[~genome.index.duplicated(keep="first")]

    print(f"Final matrix: {genome.shape[0]:,} movies × {genome.shape[1]:,} tags")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    genome.to_parquet(out_path)
    size_mb = out_path.stat().st_size / 1e6
    print(f"Saved → {out_path}  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build genome_vectors.parquet from ML-25M")
    parser.add_argument(
        "--ml25m",
        default="ml/notebooks/data/ml-25m",
        help="Path to the extracted ML-25M directory (default: ml/notebooks/data/ml-25m)",
    )
    parser.add_argument(
        "--out",
        default="ml/data/genome_vectors.parquet",
        help="Output parquet path (default: ml/data/genome_vectors.parquet)",
    )
    args = parser.parse_args()
    build(pathlib.Path(args.ml25m), pathlib.Path(args.out))
