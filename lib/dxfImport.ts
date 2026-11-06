// DXF 도면에서 전선관/전선 길이(라인 계열)와 콘센트·스위치·조명 등 개수(블록 삽입)를 자동 집계합니다.
// DWG는 Autodesk의 독점 바이너리 포맷이라 서버에서 직접 읽을 수 없으므로, CAD 프로그램에서
// "다른 이름으로 저장 → DXF"로 내보낸 파일을 입력으로 받습니다 (AutoCAD/ZWCAD/BricsCAD 등 대부분 지원).
import DxfParser from "dxf-parser";

export type DxfGroup = {
  key: string; // `${matchType}:${matchName}` — 매핑 테이블 조회/저장 키
  matchType: "layer" | "block";
  matchName: string;
  kind: "length" | "count";
  rawQty: number; // length: 도면 단위 합계 길이, count: 개수
  entityCount: number;
};

function vertexDist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(vertices: Array<{ x: number; y: number }>, closed?: boolean): number {
  let len = 0;
  for (let i = 0; i < vertices.length - 1; i++) len += vertexDist(vertices[i], vertices[i + 1]);
  if (closed && vertices.length > 1) len += vertexDist(vertices[vertices.length - 1], vertices[0]);
  return len;
}

export function parseDxf(fileText: string): { groups: DxfGroup[]; unsupported: string[]; totalEntities: number } {
  const parser = new DxfParser();
  const dxf = parser.parseSync(fileText);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entities: Array<Record<string, any>> = dxf?.entities ?? [];

  const lengthByLayer = new Map<string, { len: number; count: number }>();
  const countByBlock = new Map<string, { count: number; layer: string }>();
  const unsupportedTypes = new Set<string>();

  for (const e of entities) {
    switch (e.type) {
      case "LINE": {
        if (e.vertices?.length >= 2) {
          const layer = e.layer || "0";
          const cur = lengthByLayer.get(layer) ?? { len: 0, count: 0 };
          cur.len += vertexDist(e.vertices[0], e.vertices[1]);
          cur.count += 1;
          lengthByLayer.set(layer, cur);
        }
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        if (e.vertices?.length >= 2) {
          const layer = e.layer || "0";
          const cur = lengthByLayer.get(layer) ?? { len: 0, count: 0 };
          cur.len += polylineLength(e.vertices, e.shape || e.closed);
          cur.count += 1;
          lengthByLayer.set(layer, cur);
        }
        break;
      }
      case "INSERT": {
        const name = e.name || "(이름없음)";
        const cur = countByBlock.get(name) ?? { count: 0, layer: e.layer || "0" };
        cur.count += 1;
        countByBlock.set(name, cur);
        break;
      }
      case "ARC":
      case "CIRCLE":
      case "TEXT":
      case "MTEXT":
      case "DIMENSION":
      case "POINT":
      case "HATCH":
        // 집계 대상 아님(치수선/문자/해치 등) — 무시
        break;
      default:
        unsupportedTypes.add(e.type);
    }
  }

  const groups: DxfGroup[] = [];
  for (const [layer, v] of Array.from(lengthByLayer.entries())) {
    groups.push({ key: `layer:${layer}`, matchType: "layer", matchName: layer, kind: "length", rawQty: v.len, entityCount: v.count });
  }
  for (const [block, v] of Array.from(countByBlock.entries())) {
    groups.push({ key: `block:${block}`, matchType: "block", matchName: block, kind: "count", rawQty: v.count, entityCount: v.count });
  }
  groups.sort((a, b) => (a.kind === b.kind ? b.rawQty - a.rawQty : a.kind === "count" ? -1 : 1));

  return { groups, unsupported: Array.from(unsupportedTypes), totalEntities: entities.length };
}
