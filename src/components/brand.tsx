// The OBC roundel and the tab-bar icons, drawn with react-native-svg.
import type { ColorValue } from 'react-native';
import Svg, { Circle, Line, Path, Rect, SvgXml } from 'react-native-svg';
import { ROUNDEL_SVG } from '../brand/roundelSvg';

export function Roundel({ size = 160 }: { size?: number }) {
  return <SvgXml xml={ROUNDEL_SVG} width={size} height={size} accessibilityLabel="Orthodox Barbell Club" />;
}

type IconName = 'today' | 'program' | 'progress' | 'body' | 'club' | 'settings';

/** Simple line icons in the old style: a barbell, a calendar, a chart, a scale, a cross, a gear. */
export function Icon({ name, color, size = 24 }: { name: IconName; color: ColorValue; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'today' && (
        <>
          <Line x1="2" y1="12" x2="22" y2="12" {...p} />
          <Rect x="4" y="6" width="3" height="12" rx="0.8" {...p} />
          <Rect x="17" y="6" width="3" height="12" rx="0.8" {...p} />
          <Rect x="7.5" y="8.5" width="1.8" height="7" rx="0.5" {...p} />
          <Rect x="14.7" y="8.5" width="1.8" height="7" rx="0.5" {...p} />
        </>
      )}
      {name === 'program' && (
        <>
          <Rect x="3" y="5" width="18" height="16" rx="1.5" {...p} />
          <Line x1="3" y1="10" x2="21" y2="10" {...p} />
          <Line x1="8" y1="3" x2="8" y2="7" {...p} />
          <Line x1="16" y1="3" x2="16" y2="7" {...p} />
          <Circle cx="8" cy="14.5" r="1" fill={color} />
          <Circle cx="12" cy="14.5" r="1" fill={color} />
          <Circle cx="16" cy="14.5" r="1" fill={color} />
        </>
      )}
      {name === 'progress' && (
        <>
          <Path d="M3 3 V21 H21" {...p} />
          <Path d="M6 16 L10 11 L13.5 13.5 L20 6" {...p} />
          <Path d="M16 6 H20 V10" {...p} />
        </>
      )}
      {name === 'body' && (
        <>
          <Rect x="3" y="4" width="18" height="17" rx="3" {...p} />
          <Path d="M7 10 A5 5 0 0 1 17 10" {...p} />
          <Line x1="12" y1="10" x2="14" y2="7.5" {...p} />
        </>
      )}
      {name === 'club' && (
        <>
          <Line x1="12" y1="2" x2="12" y2="22" {...p} />
          <Line x1="9" y1="5" x2="15" y2="5" {...p} />
          <Line x1="6" y1="9" x2="18" y2="9" {...p} />
          <Line x1="9" y1="17" x2="15" y2="15" {...p} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Path
            d="M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"
            {...p}
          />
          <Circle cx="12" cy="12" r="3.2" {...p} />
        </>
      )}
    </Svg>
  );
}
