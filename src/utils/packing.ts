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
  const trailers: TrailerPlan[] = [];
  let unplacedItems = [...items];
  let currentTrailerIdx = 0;

  // Continue while there are items to place, or we haven't reached the maximum manual trailer index requested
  const maxManualIdx = items.reduce((max, item) => 
    item.manualTrailerIndex !== undefined ? Math.max(max, item.manualTrailerIndex) : max, -1);

  while (unplacedItems.length > 0 || currentTrailerIdx <= maxManualIdx) {
    const trailerId = `Trailer ${currentTrailerIdx + 1}`;
    const placedInThisTrailer: PlacedItem[] = [];
    let currentY = 0; 
    let currentWeight = 0;

    // 1. First, place items MANUALLY assigned to this specific trailer
    const manuallyAssignedItems = unplacedItems.filter(item => item.manualTrailerIndex === currentTrailerIdx);
    for (const item of manuallyAssignedItems) {
      const al = Math.max(item.length, item.width);
      const aw = Math.min(item.length, item.width);
      
      placedInThisTrailer.push({
        ...item,
        length: al,
        width: aw,
        x: (trailerWidth - aw) / 2,
        y: currentY
      });
      currentY += al;
      currentWeight += (item.weight || 0);
      
      // Remove from unplaced
      unplacedItems = unplacedItems.filter(ui => ui.id !== item.id);
    }

    // 2. Then, fill remaining space with AUTOMATIC items
    const automaticItems = unplacedItems.filter(item => item.manualTrailerIndex === undefined);
    const remainingAfterAuto: CargoItem[] = [];

    for (const item of automaticItems) {
      const al = Math.max(item.length, item.width);
      const aw = Math.min(item.length, item.width);
      const isBasket = (item.type + item.serialNumber).toLowerCase().includes('basket');
      
      // Calculate limit for THIS item
      // Normally it must fit on deck
      let fits = (currentY + al) <= trailerLength;
      
      // If it doesn't fit normally, check for overhang
      if (!fits && allowOverhang) {
        const ohLimit = isBasket ? Math.max(OH_LIMIT, BASKET_LIMIT - trailerLength) : OH_LIMIT;
        const maxAllowedWithOh = trailerLength + ohLimit;
        
        // Rules for overhang:
        // 1. Must start on deck (currentY < trailerLength)
        // 2. Part on deck must be >= 70% of item length
        // 3. Total length must be <= maxAllowedWithOh
        const startsOnDeck = currentY < trailerLength;
        const deckSupport = trailerLength - currentY;
        const supportPct = (deckSupport / al) >= 0.7;
        const withinAbsoluteLimit = (currentY + al) <= maxAllowedWithOh;
        
        if (startsOnDeck && supportPct && withinAbsoluteLimit) {
          fits = true;
        }
      }

      // Check if it fits (dimensions + weight)
      if (aw <= trailerWidth && fits && (currentWeight + (item.weight || 0)) <= trailerCapacity) {
        placedInThisTrailer.push({
          ...item,
          length: al,
          width: aw,
          x: (trailerWidth - aw) / 2,
          y: currentY
        });
        currentY += al;
        currentWeight += (item.weight || 0);
      } else {
        remainingAfterAuto.push(item);
      }
    }

    // Update unplacedItems to be those that are still truly unplaced
    const manualForFuture = unplacedItems.filter(item => item.manualTrailerIndex !== undefined && item.manualTrailerIndex > currentTrailerIdx);
    unplacedItems = [...manualForFuture, ...remainingAfterAuto];

    // Only add trailer if it's not empty, or it's an intermediate trailer needed for a later manual assignment
    if (placedInThisTrailer.length > 0 || (currentTrailerIdx < maxManualIdx)) {
      const usedArea = placedInThisTrailer.reduce((acc, item) => acc + item.length * item.width, 0);
      const totalArea = trailerWidth * trailerLength;

      trailers.push({
        id: trailerId,
        items: placedInThisTrailer,
        width: trailerWidth,
        length: trailerLength,
        fillPercentage: (usedArea / totalArea) * 100,
        totalWeight: currentWeight,
        capacity: trailerCapacity
      });
    }

    currentTrailerIdx++;

    // Safety break for unexpected infinite loops
    if (currentTrailerIdx > 50) break; 
  }

  return trailers;
}
