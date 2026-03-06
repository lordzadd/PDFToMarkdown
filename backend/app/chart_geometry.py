from __future__ import annotations

import base64
import html
import math
import re
from collections import Counter
from typing import Any

import cv2
import numpy as np

from .models.common import render_pdf_images


def _extract_label_candidates(markdown: str) -> list[str]:
    tokens = re.findall(r"\b([A-Z])\b", markdown)
    if not tokens:
        return []
    counts = Counter(tokens)
    ordered: list[str] = []
    for tok in tokens:
        if tok not in ordered:
            ordered.append(tok)
    # Keep stable order but prioritize letters that appear more often.
    ordered.sort(key=lambda t: (-counts[t], t))
    return ordered


def _extract_weight_candidates(markdown: str) -> list[float]:
    weights: list[float] = []
    for match in re.finditer(r"\b(\d+(?:\.\d+)?)\b", markdown):
        raw = match.group(1)
        try:
            value = float(raw)
        except Exception:
            continue
        # Skip clearly non-edge numbers (years, long ids, etc.).
        if value <= 0 or value > 50:
            continue
        weights.append(value)
    return weights


def _detect_circles(gray: np.ndarray) -> np.ndarray | None:
    h, w = gray.shape[:2]
    # Prefer contour-based circle detection: more stable for diagram nodes than pure Hough.
    _, bw = cv2.threshold(gray, 210, 255, cv2.THRESH_BINARY_INV)
    bw = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(bw, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    filtered: list[list[int]] = []
    min_area = max(1400, int(h * w * 0.0009))
    max_area = int(h * w * 0.08)
    for contour in contours:
        area = float(cv2.contourArea(contour))
        if area < min_area or area > max_area:
            continue
        peri = float(cv2.arcLength(contour, True))
        if peri <= 0:
            continue
        circularity = float((4.0 * math.pi * area) / (peri * peri))
        if circularity < 0.58:
            continue
        x, y, ww, hh = cv2.boundingRect(contour)
        ratio = float(ww) / float(max(hh, 1))
        if ratio < 0.7 or ratio > 1.3:
            continue
        (cx, cy), radius = cv2.minEnclosingCircle(contour)
        r = int(radius)
        if r < max(24, int(min(h, w) * 0.028)):
            continue
        filtered.append([int(cx), int(cy), r])

    if len(filtered) < 3:
        min_r = max(12, int(min(h, w) * 0.018))
        max_r = max(min_r + 8, int(min(h, w) * 0.09))
        circles = cv2.HoughCircles(
            gray,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=max(28, int(min(h, w) * 0.05)),
            param1=120,
            param2=24,
            minRadius=min_r,
            maxRadius=max_r,
        )
        if circles is None:
            return None
        detected = np.round(circles[0]).astype(int)
        if len(detected) == 0:
            return None
        radii = sorted(int(c[2]) for c in detected)
        median_r = radii[len(radii) // 2]
        max_r = max(radii)
        min_keep_r = max(18, int(max(median_r, max_r * 0.55)))
        filtered = [c.tolist() for c in detected if int(c[2]) >= min_keep_r]
        if not filtered:
            filtered = sorted(detected.tolist(), key=lambda c: int(c[2]), reverse=True)[:12]

    # Remove overlapping duplicates (keep larger radius).
    filtered = sorted(filtered, key=lambda c: int(c[2]), reverse=True)
    deduped: list[list[int]] = []
    for cand in filtered:
        cx, cy, r = int(cand[0]), int(cand[1]), int(cand[2])
        keep = True
        for ex in deduped:
            dx = cx - int(ex[0])
            dy = cy - int(ex[1])
            if math.hypot(dx, dy) < max(r, int(ex[2])) * 0.75:
                keep = False
                break
        if keep:
            deduped.append([cx, cy, r])

    if len(deduped) < 3:
        return None

    return np.array(deduped[:20], dtype=int)


def _nearest_circle_idx(x: float, y: float, circles: np.ndarray, tol_scale: float = 1.9) -> int | None:
    best_idx: int | None = None
    best_dist = float("inf")
    for idx, (cx, cy, r) in enumerate(circles):
        d = math.hypot(float(x - cx), float(y - cy))
        if d <= max(24.0, float(r) * tol_scale) and d < best_dist:
            best_idx = idx
            best_dist = d
    return best_idx


def _detect_edges(gray: np.ndarray, circles: np.ndarray) -> list[tuple[int, int]]:
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=65,
        minLineLength=35,
        maxLineGap=10,
    )
    if lines is None:
        return []

    votes: dict[tuple[int, int], int] = {}
    for line in lines:
        x1, y1, x2, y2 = line[0]
        a = _nearest_circle_idx(float(x1), float(y1), circles)
        b = _nearest_circle_idx(float(x2), float(y2), circles)
        if a is None or b is None or a == b:
            continue
        edge = (a, b) if a < b else (b, a)
        votes[edge] = votes.get(edge, 0) + 1

    if not votes:
        return []

    max_votes = max(votes.values())
    min_votes = max(2, int(max_votes * 0.25))
    filtered = [edge for edge, count in votes.items() if count >= min_votes]
    if not filtered:
        filtered = [edge for edge, _count in sorted(votes.items(), key=lambda kv: kv[1], reverse=True)[: max(2, len(circles))]]

    # Keep graph sparse; dense complete graphs are usually false positives for this use case.
    max_edges = max(4, int(len(circles) * 2.2))
    filtered = sorted(filtered, key=lambda e: votes.get(e, 0), reverse=True)[:max_edges]
    return sorted(filtered)


def _build_geometry_preview(
    nodes: list[str],
    node_positions: dict[str, tuple[float, float]],
    edges: list[dict[str, Any]],
    title: str,
) -> str:
    width = 620
    height = 360
    pad = 20

    xs = [p[0] for p in node_positions.values()]
    ys = [p[1] for p in node_positions.values()]
    min_x, max_x = (min(xs), max(xs)) if xs else (0.0, 1.0)
    min_y, max_y = (min(ys), max(ys)) if ys else (0.0, 1.0)
    span_x = max(max_x - min_x, 1.0)
    span_y = max(max_y - min_y, 1.0)

    def map_xy(x: float, y: float) -> tuple[float, float]:
        sx = pad + ((x - min_x) / span_x) * (width - pad * 2)
        sy = pad + ((y - min_y) / span_y) * (height - pad * 2)
        return sx, sy

    mapped = {name: map_xy(pos[0], pos[1]) for name, pos in node_positions.items()}

    edge_svg: list[str] = []
    weight_svg: list[str] = []
    for edge in edges:
        s = str(edge.get("source", ""))
        t = str(edge.get("target", ""))
        if s not in mapped or t not in mapped:
            continue
        x1, y1 = mapped[s]
        x2, y2 = mapped[t]
        edge_svg.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#1f2937" stroke-width="2.8"/>'
        )
        w = edge.get("weight")
        if w is not None:
            mx = (x1 + x2) / 2
            my = (y1 + y2) / 2
            weight_svg.append(
                f'<text x="{mx:.1f}" y="{my - 4:.1f}" font-size="12" fill="#111827">{html.escape(str(w))}</text>'
            )

    node_svg: list[str] = []
    for node in nodes:
        x, y = mapped[node]
        node_svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="25" fill="#ffffff" stroke="#111827" stroke-width="1.8"/>')
        node_svg.append(
            f'<text x="{x:.1f}" y="{y + 6:.1f}" text-anchor="middle" font-size="16" fill="#111827">{html.escape(node)}</text>'
        )

    safe_title = html.escape(title[:90])
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
        '<rect width="100%" height="100%" fill="#ffffff"/>'
        f'<text x="16" y="22" font-size="13" fill="#0f172a">{safe_title}</text>'
        + "".join(edge_svg)
        + "".join(weight_svg)
        + "".join(node_svg)
        + "</svg>"
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def extract_geometry_graph_charts(pdf_path: str, markdown: str, max_pages: int = 1) -> list[dict[str, Any]]:
    images = render_pdf_images(pdf_path, max_pages=max_pages, dpi=220)
    if not images:
        return []

    page_image = images[0].convert("RGB")
    page = np.array(page_image)
    gray = cv2.cvtColor(page, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    circles = _detect_circles(gray)
    if circles is None or len(circles) < 3:
        return []

    labels = _extract_label_candidates(markdown)
    # If OCR produced a plausible node count, keep the largest circles only.
    if 3 <= len(labels) < len(circles):
        ranked = sorted(circles.tolist(), key=lambda c: int(c[2]), reverse=True)
        circles = np.array(ranked[: len(labels)], dtype=int)

    edges_idx = _detect_edges(gray, circles)
    if len(edges_idx) < 2:
        return []

    # Stable node ordering by x then y so labels map consistently.
    sorted_idx = sorted(range(len(circles)), key=lambda i: (int(circles[i][0]), int(circles[i][1])))

    node_names: dict[int, str] = {}
    for i, circle_idx in enumerate(sorted_idx):
        if i < len(labels):
            node_names[circle_idx] = labels[i]
        else:
            node_names[circle_idx] = f"N{i+1}"

    node_positions: dict[str, tuple[float, float]] = {}
    for circle_idx in sorted_idx:
        cx, cy, _r = circles[circle_idx]
        node_positions[node_names[circle_idx]] = (float(cx), float(cy))

    weights = _extract_weight_candidates(markdown)
    edges_sorted = sorted(edges_idx, key=lambda e: (min(circles[e[0]][0], circles[e[1]][0]), min(circles[e[0]][1], circles[e[1]][1])))

    edge_points: list[dict[str, Any]] = []
    for idx, (a, b) in enumerate(edges_sorted):
        weight = weights[idx] if idx < len(weights) else None
        edge_points.append(
            {
                "source": node_names[a],
                "target": node_names[b],
                "weight": weight,
            }
        )

    chart_nodes = [node_names[i] for i in sorted_idx]
    preview = _build_geometry_preview(chart_nodes, node_positions, edge_points, "Geometry-derived weighted graph")

    return [
        {
            "id": "chart-1",
            "page": 1,
            "bbox": None,
            "chart_type": "weighted_graph",
            "title": "Geometry-derived weighted graph",
            "x_label": None,
            "y_label": "edge_weight",
            "series": [{"name": "edges", "points": edge_points}],
            "confidence": 0.72,
            "field_confidence": {
                "chart_type": 0.85,
                "series": 0.72,
                "topology": 0.78,
                "weights": 0.55 if any(p.get("weight") is not None for p in edge_points) else 0.25,
            },
            "flags": ["geometry-derived", "topology-vision-estimated", "manual-review-recommended"],
            "preview_image_data_url": preview,
            "raw": {
                "source": "geometry-graph-v1",
                "circles_detected": int(len(circles)),
                "edges_detected": int(len(edges_sorted)),
                "labels_from_markdown": labels,
                "weights_from_markdown": weights,
                "node_mapping": node_names,
                "warning": "Node labels and weights are mapped from OCR text; verify before downstream use.",
            },
        }
    ]
