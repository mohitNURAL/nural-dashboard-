// Apache ECharts wrapper (SRS 7). Only the bar chart pieces are registered to keep the bundle small.
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { chartText } from './chartTheme';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

interface Props {
  option: EChartsOption;
  height: number;
  label: string;
  onClick?: (params: { name: string; seriesName?: string; dataIndex: number }) => void;
}

export function Chart({ option, height, label, onClick }: Props) {
  return (
    <div role="img" aria-label={label}>
      <ReactEChartsCore
        echarts={echarts}
        option={{ textStyle: chartText, animationDuration: 300, ...option }}
        style={{ height, width: '100%' }}
        opts={{ renderer: 'svg' }}
        notMerge
        onEvents={onClick ? { click: onClick } : undefined}
      />
    </div>
  );
}
