import React, { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import { useTheme } from '../context/ThemeContext';

export interface PlotlyChartProps {
  data: Plotly.Data[];
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  style?: React.CSSProperties;
  className?: string;
}

export const PlotlyChart: React.FC<PlotlyChartProps> = ({
  data,
  layout,
  config,
  style,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const paperBg = isLight ? '#ffffff' : '#151820';
    const plotBg = isLight ? '#ffffff' : '#151820';
    const fontColor = isLight ? '#0f172a' : '#d4daf0';
    const dimColor = isLight ? '#475569' : '#7a8099';
    const legendBg = isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(21, 24, 32, 0.7)';
    const borderColor = isLight ? '#cbd5e1' : '#252a35';
    const gridColor = isLight ? '#e2e8f0' : '#252a35';

    // Clone and adapt layout axes for theme
    const themeAdaptedLayout: Partial<Plotly.Layout> = { ...layout };

    if (themeAdaptedLayout.xaxis) {
      themeAdaptedLayout.xaxis = {
        gridcolor: gridColor,
        zerolinecolor: gridColor,
        ...themeAdaptedLayout.xaxis,
        tickfont: isLight
          ? { color: '#334155', size: 10 }
          : themeAdaptedLayout.xaxis.tickfont,
      };
    }
    if (themeAdaptedLayout.yaxis) {
      themeAdaptedLayout.yaxis = {
        gridcolor: gridColor,
        zerolinecolor: gridColor,
        ...themeAdaptedLayout.yaxis,
      };
    }
    if (themeAdaptedLayout.polar) {
      themeAdaptedLayout.polar = {
        ...themeAdaptedLayout.polar,
        bgcolor: isLight ? '#f8fafc' : '#151820',
        angularaxis: {
          gridcolor: gridColor,
          linecolor: gridColor,
          tickfont: { color: fontColor, size: 10 },
          ...themeAdaptedLayout.polar.angularaxis,
        },
        radialaxis: {
          gridcolor: gridColor,
          linecolor: gridColor,
          tickfont: { color: dimColor, size: 9 },
          ...themeAdaptedLayout.polar.radialaxis,
        },
      };
    }

    const defaultLayout: Partial<Plotly.Layout> = {
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      font: {
        family: 'IBM Plex Mono, monospace',
        color: fontColor,
        size: 11,
      },
      margin: { t: 36, r: 24, b: 40, l: 48 },
      autosize: true,
      legend: {
        font: { color: dimColor, size: 10 },
        bgcolor: legendBg,
        bordercolor: borderColor,
        borderwidth: 1,
      },
      ...themeAdaptedLayout,
    };

    const defaultConfig: Partial<Plotly.Config> = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: 'cpu_scheduler_plot',
        height: 500,
        width: 800,
        scale: 2,
      },
      ...config,
    };

    Plotly.react(el, data, defaultLayout, defaultConfig);

    const handleResize = () => {
      Plotly.Plots.resize(el);
    };

    const observer = new ResizeObserver(() => {
      handleResize();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      Plotly.purge(el);
    };
  }, [data, layout, config, isLight]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', minHeight: '320px', ...style }}
      className={className}
    />
  );
};
