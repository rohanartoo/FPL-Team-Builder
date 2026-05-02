export const POSITION_LABEL = ["", "GKP", "DEF", "MID", "FWD"] as const;

export const formatPrice = (costTenths: number): string => (costTenths / 10).toFixed(1);

export const getPositionLabel = (elementType: number): string => POSITION_LABEL[elementType] ?? "";

export const getChipLabel = (name: string): string => {
  switch (name) {
    case "bboost": return "Bench Boost";
    case "3xc": return "Triple Capt";
    case "freehit": return "Free Hit";
    case "wildcard": return "Wildcard";
    default: return name;
  }
};
