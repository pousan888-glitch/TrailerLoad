import { CargoItem, TrailerPlan, PlacedItem } from '../types';

export function packCargo(
  items: CargoItem[],
  trailerWidth: number = 250,
  trailerLength: number = 1200,
  allowOverhang: boolean = false,
  trailerCapacity: number = 25000
): TrailerPlan[] {
  const OH_LIMIT = 150; // 1.5m standard overhang
  const BASKET_LIMIT = 1250; // Special limit for baskets
  const effectiveLength = allowOverhang ? trailerLength + OH_LIMIT : trailerLength;
  
  const trailers: TrailerPlan[] = [];
  let queue = [...items];

  while (queue.length > 0) {
    const trailerId = `Trailer ${trailers.length + 1}`;
    const placedItems: PlacedItem[] = [];
    let currentY = 0; 
    let currentWeight = 0;
    let remainingQueue: CargoItem[] = [];

    for (const item of queue) {
      const isBasket = (item.type + item.serialNumber).toLowerCase().includes('basket');
      const limit = isBasket ? Math.max(effectiveLength, BASKET_LIMIT) : effectiveLength;
      
      const al = Math.max(item.length, item.width);
      const aw = Math.min(item.length, item.width);

      // Check both dimensions and capacity
      if (aw <= trailerWidth && (currentY + al) <= limit && (currentWeight + (item.weight || 0)) <= trailerCapacity) {
        placedItems.push({
          ...item,
          length: al,
          width: aw,
          x: (trailerWidth - aw) / 2,
          y: currentY
        });
        currentY += al;
        currentWeight += (item.weight || 0);
      } else {
        remainingQueue.push(item);
      }
    }

    if (placedItems.length === 0) {
      if (queue.length > 0) {
        const first = queue[0];
        if (Math.min(first.length, first.width) > trailerWidth || (first.weight || 0) > trailerCapacity) {
           queue.shift();
           continue;
        }
      }
      break;
    }

    queue = remainingQueue;

    const usedArea = placedItems.reduce((acc, item) => acc + item.length * item.width, 0);
    const totalArea = trailerWidth * trailerLength;

    trailers.push({
      id: trailerId,
      items: placedItems,
      width: trailerWidth,
      length: trailerLength,
      fillPercentage: (usedArea / totalArea) * 100,
      totalWeight: currentWeight,
      capacity: trailerCapacity
    });
  }

  return trailers;
}
