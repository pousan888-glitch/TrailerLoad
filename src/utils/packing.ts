import { CargoItem, TrailerPlan, PlacedItem } from '../types';

export function packCargo(
  items: CargoItem[],
  trailerWidth: number = 250,
  trailerLength: number = 1200,
  allowOverhang: boolean = false
): TrailerPlan[] {
  const overhangLimit = 150; // 1.5 meters
  const effectiveLength = allowOverhang ? trailerLength + overhangLimit : trailerLength;
  
  const trailers: TrailerPlan[] = [];
  let currentItems = [...items];

  // Strictly Sequential Packing: Maintains the order of the manifest
  while (currentItems.length > 0) {
    const trailerId = `Trailer ${trailers.length + 1}`;
    const placedItems: PlacedItem[] = [];
    let currentY = 0; 

    // We only try to fit items in order starting from the first one in the list
    while (currentItems.length > 0) {
      const item = currentItems[0];
      const actualL = Math.max(item.length, item.width);
      const actualW = Math.min(item.length, item.width);

      // If it fits cross-wise
      if (actualW <= trailerWidth) {
        // If it fits length-wise (including possible overhang)
        if (currentY + actualL <= effectiveLength) {
          placedItems.push({
            ...item,
            length: actualL,
            width: actualW,
            x: (trailerWidth - actualW) / 2,
            y: currentY
          });
          currentY += actualL;
          currentItems.shift(); // Remove handled item
        } else {
          // Doesn't fit in THIS trailer, must stop and start a new one
          break;
        }
      } else {
        // Item is physically too wide for the trailer, skip it entirely to avoid infinite loop
        console.warn(`Item ${item.serialNumber} is too wide for the trailer and was skipped.`);
        currentItems.shift();
      }
    }

    if (placedItems.length === 0) break;

    const usedArea = placedItems.reduce((acc, item) => acc + item.length * item.width, 0);
    const totalArea = trailerWidth * trailerLength;

    trailers.push({
      id: trailerId,
      items: placedItems,
      width: trailerWidth,
      length: trailerLength,
      fillPercentage: (usedArea / totalArea) * 100
    });
  }

  return trailers;
}
