export interface CargoItem {
  id: string;
  type: string;
  serialNumber: string;
  segment: string;
  rig: string;
  length: number; // in cm
  width: number;  // in cm
  weight: number; // in kg
}

export interface PlacedItem extends CargoItem {
  x: number;
  y: number;
}

export interface TrailerPlan {
  id: string;
  items: PlacedItem[];
  width: number;
  length: number;
  fillPercentage: number;
  totalWeight: number;
  capacity: number;
}
