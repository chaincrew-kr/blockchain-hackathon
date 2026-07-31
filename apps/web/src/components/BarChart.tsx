/**
 * 단일 계열 소형 바 차트 — KOBIS 대조 패널용.
 * 데모 발권(건)과 실존 영화 관객(명)은 단위·규모가 달라 축을 공유하지 않고
 * 패널 2개로 분리한다. 접근성: 호버 툴팁 + "표로 보기" 테이블 뷰 제공.
 *
 * .plot 래퍼: 날짜 라벨(.bar .x)이 bottom:-20px로 박스 밖에 그려지는 설계라,
 * .chart 높이(170px)에 그 20px을 미리 비워두지 않으면 다음 요소(표로 보기)와
 * 겹친다. gridline·bars를 .plot(top:0,bottom:20px) 안에 넣어 라벨 자리를
 * .chart 박스 내부로 확보한다.
 */
import { useState } from "react";

export interface BarDatum {
  d: string;
  v: number;
}

interface BarChartProps {
  data: BarDatum[];
  unit: string;
  color: string;
  gridStep: number;
}

export function BarChart({ data, unit, color, gridStep }: BarChartProps) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(
    null,
  );

  const max = Math.max(...data.map((d) => d.v));
  const top = Math.ceil(max / gridStep) * gridStep;
  const maxIndex = data.findIndex((d) => d.v === max);

  return (
    <>
      <div className="chart">
        <div className="plot">
          {[1, 2].map((g) => {
            const y = (top * g) / 2;
            return (
              <div
                key={g}
                className="gridline"
                style={{ bottom: `${(y / top) * 100}%` }}
              />
            );
          })}
          <div className="bars">
            {data.map((d, i) => (
              <div
                key={d.d}
                className="bar"
                onMouseMove={(e) =>
                  setTip({
                    x: e.clientX,
                    y: e.clientY,
                    text: `${d.d} · ${d.v.toLocaleString()}${unit}`,
                  })
                }
                onMouseLeave={() => setTip(null)}
              >
                {i === maxIndex && (
                  <span
                    className="dl"
                    style={{ top: `${100 - (d.v / top) * 100 - 14}%` }}
                  >
                    {d.v.toLocaleString()}
                  </span>
                )}
                <i
                  style={{ height: `${(d.v / top) * 100}%`, background: color }}
                />
                <span className="x">{d.d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <details className="tbl">
        <summary>표로 보기</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th className="num">{unit.trim()}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.d}>
                  <td className="mono">{d.d}</td>
                  <td className="mono">{d.v.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {tip && (
        <div
          className="tooltip"
          role="status"
          style={{ left: tip.x + 14, top: tip.y - 10 }}
        >
          {tip.text}
        </div>
      )}
    </>
  );
}
