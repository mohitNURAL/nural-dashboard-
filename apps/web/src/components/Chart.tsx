// Apache ECharts wrapper (SRS 7). Only the bar chart pieces are registered to keep the bundle small.
// Every chart gets the dashboard look here (2026-10-12), under its own settings: gradient bars
// with rounded ends, smooth lines with a soft glow and a faded area, light dashed grid lines,
// frosted tooltips and an easing entry.
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { alpha, chartText, chartTooltip, lighten, token } from './chartTheme';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

interface Props {
  option: EChartsOption;
  height: number;
  label: string;
  onClick?: (params: { name: string; seriesName?: string; dataIndex: number }) => void;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v ? [v] : []);

/** A plain colour as a gradient along the bar: light at the start, full at the end. */
function gradient(color: unknown, horizontal: boolean): unknown {
  if (typeof color !== 'string') return color;
  const start = lighten(color, 0.28);
  return {
    type: 'linear',
    x: 0,
    y: horizontal ? 0 : 1,
    x2: horizontal ? 1 : 0,
    y2: 0,
    colorStops: [
      { offset: 0, color: start },
      { offset: 1, color },
    ],
  };
}

function styleBar(sr: Obj, horizontal: boolean): Obj {
  const stacked = !!sr.stack;
  const r = stacked ? 3 : 7;
  const radius = horizontal ? [0, r, r, 0] : [r, r, 0, 0];
  const own = isObj(sr.itemStyle) ? sr.itemStyle : {};
  const data = Array.isArray(sr.data)
    ? sr.data.map((d) =>
        isObj(d) && isObj(d.itemStyle) && typeof d.itemStyle.color === 'string'
          ? { ...d, itemStyle: { ...d.itemStyle, color: gradient(d.itemStyle.color, horizontal) } }
          : d,
      )
    : sr.data;
  const color = typeof own.color === 'string' ? own.color : undefined;
  return {
    ...sr,
    data,
    itemStyle: {
      borderRadius: radius,
      ...own,
      ...(color ? { color: gradient(color, horizontal) } : {}),
    },
    emphasis: {
      focus: 'series',
      itemStyle: {
        shadowBlur: 14,
        shadowColor: color ? alpha(color, 0.45) : 'rgba(16,24,64,0.25)',
      },
      ...(isObj(sr.emphasis) ? sr.emphasis : {}),
    },
  };
}

function styleLine(sr: Obj): Obj {
  const own = isObj(sr.lineStyle) ? sr.lineStyle : {};
  const color =
    typeof own.color === 'string'
      ? own.color
      : isObj(sr.itemStyle) && typeof sr.itemStyle.color === 'string'
        ? sr.itemStyle.color
        : undefined;
  return {
    smooth: 0.35,
    symbol: 'circle',
    symbolSize: 7,
    ...sr,
    lineStyle: {
      width: 3,
      ...(color ? { shadowBlur: 10, shadowColor: alpha(color, 0.35), shadowOffsetY: 4 } : {}),
      ...own,
    },
    ...(color && !sr.areaStyle
      ? {
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: alpha(color, 0.22) },
                { offset: 1, color: alpha(color, 0) },
              ],
            },
          },
        }
      : {}),
  };
}

/**
 * Theme defaults under each chart's own settings: axis labels and data labels in the theme's text
 * colour, and no outline around data labels (ECharts' default outline smears them on dark).
 */
function themed(option: EChartsOption): EChartsOption {
  const text = token('--text');
  const muted = token('--text-muted');
  const grid = alpha(token('--primary'), 0.1);
  const axis = (a: unknown) =>
    list(a).map((x) =>
      isObj(x)
        ? {
            axisLine: { show: x.type === 'category', lineStyle: { color: grid } },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: grid, type: 'dashed' } },
            ...x,
            axisLabel: { color: muted, ...(x.axisLabel as Obj | undefined) },
          }
        : x,
    );
  // Horizontal bars: the category axis is the y axis.
  const horizontal = list(option.yAxis).some((y) => isObj(y) && y.type === 'category');
  const series = list(option.series).map((sr) => {
    if (!isObj(sr)) return sr;
    let out = sr;
    if (sr.type === 'bar') out = styleBar(out, horizontal);
    if (sr.type === 'line') out = styleLine(out);
    return isObj(out.label)
      ? { ...out, label: { color: text, textBorderWidth: 0, ...out.label } }
      : out;
  });
  return {
    ...option,
    ...(option.xAxis ? { xAxis: axis(option.xAxis) as EChartsOption['xAxis'] } : {}),
    ...(option.yAxis ? { yAxis: axis(option.yAxis) as EChartsOption['yAxis'] } : {}),
    ...(option.series ? { series: series as EChartsOption['series'] } : {}),
  };
}

export function Chart({ option: raw, height, label, onClick }: Props) {
  const option = themed(raw);
  return (
    <div role="img" aria-label={label}>
      <ReactEChartsCore
        echarts={echarts}
        option={{
          textStyle: chartText(),
          animationDuration: 650,
          animationEasing: 'cubicOut',
          animationDurationUpdate: 400,
          ...option,
          // Theme colours under each chart's own tooltip settings.
          ...(option.tooltip && !Array.isArray(option.tooltip)
            ? { tooltip: { ...chartTooltip(), ...option.tooltip } }
            : {}),
          ...(option.legend && !Array.isArray(option.legend)
            ? {
                legend: {
                  icon: 'roundRect',
                  itemWidth: 12,
                  itemHeight: 8,
                  textStyle: { color: token('--text') },
                  ...option.legend,
                },
              }
            : {}),
        }}
        style={{ height, width: '100%' }}
        opts={{ renderer: 'svg' }}
        notMerge
        onEvents={onClick ? { click: onClick } : undefined}
      />
    </div>
  );
}
