// Apache ECharts wrapper (SRS 7). Only the bar chart pieces are registered to keep the bundle small.
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { chartText, chartTooltip, token } from './chartTheme';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

interface Props {
  option: EChartsOption;
  height: number;
  label: string;
  onClick?: (params: { name: string; seriesName?: string; dataIndex: number }) => void;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Theme defaults under each chart's own settings: axis labels and data labels in the theme's text
 * colour, and no outline around data labels (ECharts' default outline smears them on dark).
 */
function themed(option: EChartsOption): EChartsOption {
  const text = token('--text');
  const muted = token('--text-muted');
  const axis = (a: unknown) =>
    isObj(a) ? { ...a, axisLabel: { color: muted, ...(a.axisLabel as Obj | undefined) } } : a;
  const series = (
    Array.isArray(option.series) ? option.series : option.series ? [option.series] : []
  ).map((sr) =>
    isObj(sr) && isObj(sr.label)
      ? { ...sr, label: { color: text, textBorderWidth: 0, ...sr.label } }
      : sr,
  );
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
          animationDuration: 300,
          ...option,
          // Theme colours under each chart's own tooltip settings.
          ...(option.tooltip && !Array.isArray(option.tooltip)
            ? { tooltip: { ...chartTooltip(), ...option.tooltip } }
            : {}),
          ...(option.legend && !Array.isArray(option.legend)
            ? { legend: { textStyle: { color: token('--text') }, ...option.legend } }
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
