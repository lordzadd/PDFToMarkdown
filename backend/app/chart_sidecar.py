from __future__ import annotations

import base64
import html
import math
import re
from typing import Any


def _safe_float(value: str) -> float | None:
    try:
        cleaned = value.replace(",", "").strip()
        return float(cleaned)
    except Exception:
        return None


def _table_blocks(markdown: str) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in markdown.splitlines():
        if line.strip().startswith("|"):
            current.append(line.strip())
            continue
        if current:
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)
    return blocks


def _parse_markdown_table(lines: list[str]) -> tuple[list[str], list[list[str]]] | None:
    if len(lines) < 3:
        return None
    header = [cell.strip() for cell in lines[0].split("|") if cell.strip()]
    sep = lines[1]
    if not re.search(r"-{3,}", sep):
        return None
    rows: list[list[str]] = []
    for line in lines[2:]:
        row = [cell.strip() for cell in line.split("|") if cell.strip()]
        if row:
            rows.append(row)
    if not header or not rows:
        return None
    return header, rows


def _build_bar_preview(labels: list[str], values: list[float], title: str) -> str:
    width = 520
    height = 280
    margin = 28
    plot_w = width - margin * 2
    plot_h = height - margin * 2
    n = max(1, len(values))
    max_v = max(values) if values else 1.0
    max_v = max(max_v, 1.0)
    bar_w = plot_w / n

    bars: list[str] = []
    ticks: list[str] = []
    for idx, value in enumerate(values):
        bar_h = (value / max_v) * (plot_h - 20)
        x = margin + idx * bar_w + 4
        y = margin + plot_h - bar_h
        bars.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(8, bar_w - 8):.1f}" height="{bar_h:.1f}" fill="#6366f1" />'
        )
        label = html.escape(labels[idx][:14])
        ticks.append(
            f'<text x="{x + bar_w/2:.1f}" y="{height - 8}" text-anchor="middle" font-size="10" fill="#475569">{label}</text>'
        )

    safe_title = html.escape(title[:64] if title else "Detected chart")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
        '<rect width="100%" height="100%" fill="#ffffff"/>'
        f'<text x="{margin}" y="18" font-size="13" fill="#0f172a">{safe_title}</text>'
        f'<line x1="{margin}" y1="{margin + plot_h}" x2="{width - margin}" y2="{margin + plot_h}" stroke="#94a3b8" />'
        + "".join(bars)
        + "".join(ticks)
        + "</svg>"
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def _extract_weighted_edges(markdown: str) -> list[dict[str, Any]]:
    patterns = [
        re.compile(r"\b([A-Za-z][A-Za-z0-9_]*)\s*[-–]\s*([A-Za-z][A-Za-z0-9_]*)\s*[:=]?\s*(-?\d+(?:\.\d+)?)\b"),
        re.compile(r"\(\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*([A-Za-z][A-Za-z0-9_]*)\s*\)\s*[:=]?\s*(-?\d+(?:\.\d+)?)\b"),
        # OCR often emits graph edges as "A B 3" without punctuation.
        re.compile(r"\b([A-Z])\s+([A-Z])\s*[:=]?\s*(-?\d+(?:\.\d+)?)\b"),
    ]
    edges: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for pattern in patterns:
        for match in pattern.finditer(markdown):
            a = match.group(1).strip()
            b = match.group(2).strip()
            w = match.group(3).strip()
            key = tuple(sorted((a, b)) + [w])  # bidirectional style dedupe
            if key in seen:
                continue
            seen.add(key)
            weight = _safe_float(w)
            edges.append({"source": a, "target": b, "weight": weight if weight is not None else w})
    return edges


def _build_graph_preview(nodes: list[str], edges: list[dict[str, Any]], title: str) -> str:
    width = 560
    height = 320
    cx = width / 2
    cy = height / 2
    radius = min(width, height) * 0.34
    n = max(1, len(nodes))

    positions: dict[str, tuple[float, float]] = {}
    for idx, node in enumerate(nodes):
        angle = (2 * math.pi * idx / n) - (math.pi / 2)
        positions[node] = (cx + radius * math.cos(angle), cy + radius * math.sin(angle))

    edge_svg: list[str] = []
    label_svg: list[str] = []
    occupied_labels: list[tuple[float, float]] = []
    for edge in edges:
        s = str(edge.get("source", ""))
        t = str(edge.get("target", ""))
        if s not in positions or t not in positions:
            continue
        x1, y1 = positions[s]
        x2, y2 = positions[t]
        edge_svg.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#334155" stroke-width="2"/>')
        mx = (x1 + x2) / 2.0
        my = (y1 + y2) / 2.0
        dx = x2 - x1
        dy = y2 - y1
        length = max(math.hypot(dx, dy), 1.0)
        nx = -dy / length
        ny = dx / length
        lx = mx + nx * 10.0
        ly = my + ny * 10.0
        for _ in range(2):
            if any(math.hypot(lx - ox, ly - oy) < 18.0 for ox, oy in occupied_labels):
                lx += nx * 8.0
                ly += ny * 8.0
            else:
                break
        occupied_labels.append((lx, ly))
        weight = html.escape(str(edge.get("weight", "")))
        text_w = max(10.0, float(len(weight) * 6))
        label_svg.append(
            f'<rect x="{lx - text_w/2 - 3:.1f}" y="{ly - 11:.1f}" width="{text_w + 6:.1f}" height="14" '
            'rx="3" fill="#ffffff" fill-opacity="0.9" stroke="#cbd5e1" stroke-width="0.7"/>'
        )
        label_svg.append(
            f'<text x="{lx:.1f}" y="{ly:.1f}" text-anchor="middle" font-size="11" fill="#111827">{weight}</text>'
        )

    node_svg: list[str] = []
    for node in nodes:
        x, y = positions[node]
        safe_node = html.escape(node[:18])
        node_svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="22" fill="#ffffff" stroke="#111827" stroke-width="1.5"/>')
        node_svg.append(f'<text x="{x:.1f}" y="{y + 5:.1f}" text-anchor="middle" font-size="14" fill="#111827">{safe_node}</text>')

    safe_title = html.escape(title[:72] if title else "Detected graph")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
        '<rect width="100%" height="100%" fill="#ffffff"/>'
        f'<text x="18" y="22" font-size="13" fill="#0f172a">{safe_title}</text>'
        + "".join(edge_svg)
        + "".join(label_svg)
        + "".join(node_svg)
        + "</svg>"
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def _extract_graph_tokens(markdown: str) -> tuple[list[str], list[float]]:
    lines = [ln.strip() for ln in markdown.splitlines() if ln.strip()]
    node_from_lines = [ln for ln in lines if re.fullmatch(r"[A-Z]", ln)]
    node_from_text = re.findall(r"\b([A-Z])\b", markdown)
    node_tokens = node_from_lines + node_from_text
    nodes = sorted(set(node_tokens))
    if len(nodes) > 8:
        # Keep the most likely graph-node labels first (common in coursework screenshots).
        preferred = [n for n in "ABCDEFGH" if n in nodes]
        nodes = preferred or nodes[:8]

    weight_tokens = [ln for ln in lines if re.fullmatch(r"\d+(?:\.\d+)?", ln)]
    weights = []
    for tok in weight_tokens:
        v = _safe_float(tok)
        if v is not None:
            weights.append(v)
    return nodes, weights


def extract_charts_sidecar(markdown: str) -> list[dict[str, Any]]:
    """
    Lightweight additive chart extractor.
    This is intentionally sidecar-only and never mutates markdown.
    """
    charts: list[dict[str, Any]] = []
    chart_id = 1

    for block in _table_blocks(markdown):
        parsed = _parse_markdown_table(block)
        if not parsed:
            continue
        header, rows = parsed
        if len(header) < 2:
            continue

        labels: list[str] = []
        values: list[float] = []
        for row in rows:
            if len(row) < 2:
                continue
            value = _safe_float(row[1])
            if value is None:
                continue
            labels.append(row[0])
            values.append(value)

        if len(values) < 2:
            continue

        title = f"{header[1]} by {header[0]}"
        series_points = [{"label": labels[i], "value": values[i]} for i in range(len(values))]
        preview = _build_bar_preview(labels, values, title)

        chart = {
            "id": f"chart-{chart_id}",
            "page": 1,
            "bbox": None,
            "chart_type": "bar",
            "title": title,
            "x_label": header[0],
            "y_label": header[1],
            "series": [
                {
                    "name": header[1],
                    "points": series_points,
                }
            ],
            "confidence": 0.62,
            "field_confidence": {
                "chart_type": 0.8,
                "title": 0.65,
                "series": 0.6,
            },
            "flags": ["table-derived", "best-effort"],
            "preview_image_data_url": preview,
            "raw": {
                "source": "markdown-table-sidecar",
                "header": header,
                "rows": rows,
            },
        }
        charts.append(chart)
        chart_id += 1

    edges = _extract_weighted_edges(markdown)
    if len(edges) >= 2:
        nodes = sorted({str(edge["source"]) for edge in edges}.union({str(edge["target"]) for edge in edges}))
        graph_title = "Weighted graph diagram"
        graph_preview = _build_graph_preview(nodes, edges, graph_title)
        charts.append(
            {
                "id": f"chart-{chart_id}",
                "page": 1,
                "bbox": None,
                "chart_type": "weighted_graph",
                "title": graph_title,
                "x_label": None,
                "y_label": "edge_weight",
                "series": [
                    {
                        "name": "edges",
                        "points": edges,
                    }
                ],
                "confidence": 0.45,
                "field_confidence": {
                    "chart_type": 0.7,
                    "series": 0.45,
                },
                "flags": ["text-derived", "best-effort", "graph-diagram"],
                "preview_image_data_url": graph_preview,
                "raw": {
                    "source": "markdown-graph-sidecar",
                    "edges": edges,
                },
            }
        )

    if not charts and re.search(r"\b(graph|node|edge)\b", markdown, flags=re.IGNORECASE):
        nodes, weights = _extract_graph_tokens(markdown)
        if len(nodes) >= 3:
            pseudo_edges: list[dict[str, Any]] = []
            for idx in range(len(nodes) - 1):
                pseudo_edges.append(
                    {
                        "source": nodes[idx],
                        "target": nodes[idx + 1],
                        "weight": weights[idx] if idx < len(weights) else None,
                    }
                )
            preview = _build_graph_preview(nodes, pseudo_edges, "Graph candidate (OCR-derived, topology unverified)")
            charts.append(
                {
                    "id": f"chart-{chart_id}",
                    "page": 1,
                    "bbox": None,
                    "chart_type": "weighted_graph_candidate",
                    "title": "Graph candidate (OCR-derived, topology unverified)",
                    "x_label": None,
                    "y_label": "edge_weight",
                    "series": [{"name": "edges", "points": pseudo_edges}],
                    "confidence": 0.08,
                    "field_confidence": {"chart_type": 0.35, "series": 0.08},
                    "flags": ["ocr-derived", "inferred-edges", "topology-unverified", "manual-review-recommended"],
                    "preview_image_data_url": preview,
                    "raw": {
                        "source": "markdown-token-heuristic",
                        "nodes_detected": nodes,
                        "weights_detected": weights,
                        "inferred_edges": pseudo_edges,
                        "warning": "Topology inferred from OCR tokens only; requires manual correction or vision-based chart model.",
                    },
                }
            )

    return charts
