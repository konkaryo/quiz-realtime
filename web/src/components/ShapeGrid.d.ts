import type { ComponentType } from "react";

export type ShapeGridProps = {
  direction?: "right" | "left" | "up" | "down" | "diagonal";
  speed?: number;
  borderColor?: string;
  squareSize?: number;
  hoverFillColor?: string;
  shape?: "square" | "hexagon" | "triangle" | "circle";
  hoverTrailAmount?: number;
  className?: string;
};

declare const ShapeGrid: ComponentType<ShapeGridProps>;

export default ShapeGrid;