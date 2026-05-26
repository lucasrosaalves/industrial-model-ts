export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GridBreakpoint = 'xxl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs' | 'xxs';

export type WidgetPositionMap = Partial<Record<GridBreakpoint, GridPosition>>;


export const jsonPropertyTypes = [
  { space: "dashboard_builder", view: "PageWidget", property: "position", type: "WidgetPositionMap" },
] as const;
