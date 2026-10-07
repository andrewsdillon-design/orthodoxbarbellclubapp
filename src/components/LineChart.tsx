// A small dated line chart drawn with react-native-svg: gold grid, purple (or gold, in dark mode) line.
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { fmtDate, parseIsoDate } from '../lib/dates';
import { fmtNum } from '../lib/units';
import { fonts, useTheme } from '../theme';
import { T } from './ui';

export interface Point {
  date: string;
  value: number;
}

const PAD = { left: 44, right: 12, top: 12, bottom: 24 };

function niceRange(min: number, max: number): [number, number, number] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const rough = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step, step];
}

export function LineChart({ points, height = 180, unit = '' }: { points: Point[]; height?: number; unit?: string }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const data = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (data.length === 0) {
    return <T muted style={{ paddingVertical: 20, textAlign: 'center' }}>Nothing logged yet.</T>;
  }
  const times = data.map((p) => parseIsoDate(p.date).getTime());
  const t0 = times[0];
  const t1 = times[times.length - 1] === t0 ? t0 + 86400000 : times[times.length - 1];
  const [lo, hi, step] = niceRange(Math.min(...data.map((p) => p.value)), Math.max(...data.map((p) => p.value)));
  const w = Math.max(width - PAD.left - PAD.right, 1);
  const h = height - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * w;
  const y = (v: number) => PAD.top + h - ((v - lo) / (hi - lo)) * h;
  const line = data.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(times[times.length - 1]).toFixed(1)},${PAD.top + h} L${x(t0).toFixed(1)},${PAD.top + h} Z`;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  const last = data[data.length - 1];

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Chart from ${fmtDate(data[0].date)} to ${fmtDate(last.date)}, latest ${fmtNum(last.value)} ${unit}`}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((v) => (
            <Line key={`g${v}`} x1={PAD.left} x2={PAD.left + w} y1={y(v)} y2={y(v)} stroke={c.chartGrid} strokeWidth={1} />
          ))}
          {ticks.map((v) => (
            <SvgText key={`t${v}`} x={PAD.left - 6} y={y(v) + 4} fontSize={10} fill={c.muted} textAnchor="end" fontFamily={fonts.body}>
              {fmtNum(v)}
            </SvgText>
          ))}
          <Path d={area} fill={c.chartFill} />
          <Path d={line} stroke={c.chartLine} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
          {data.length <= 40 &&
            data.map((p, i) => <Circle key={i} cx={x(times[i])} cy={y(p.value)} r={3} fill={c.gold} stroke={c.chartLine} strokeWidth={1} />)}
          <SvgText x={PAD.left} y={height - 6} fontSize={10} fill={c.muted} fontFamily={fonts.body}>
            {fmtDate(data[0].date, true)}
          </SvgText>
          <SvgText x={PAD.left + w} y={height - 6} fontSize={10} fill={c.muted} textAnchor="end" fontFamily={fonts.body}>
            {fmtDate(last.date, true)}
          </SvgText>
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}
