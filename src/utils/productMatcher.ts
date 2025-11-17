type Product = {
  id: string;
  name: string;
  price: number;
};

export function matchProducts(query: string, candidates: Product[]): Product[] {
  const normalizedQuery = query.toLowerCase();
  return candidates.filter((product) => product.name.toLowerCase().includes(normalizedQuery));
}


