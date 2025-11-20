import React from 'react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  // Fallback image if scraping didn't yield one
  const imageSrc = product.imageUrl && product.imageUrl.startsWith('http') 
    ? product.imageUrl 
    : `https://picsum.photos/400/300?random=${Math.floor(Math.random() * 1000)}`;

  return (
    <div className="flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full max-w-xs mb-4 transition-transform active:scale-[0.98]">
      <div className="relative h-48 w-full bg-slate-100 overflow-hidden">
        <img 
          src={imageSrc} 
          alt={product.name} 
          className="object-cover w-full h-full"
        />
        {product.inStock && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md">
            En Stock
          </div>
        )}
      </div>
      
      <div className="p-4 flex flex-col flex-grow">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-sm font-semibold text-slate-800 line-clamp-2 leading-tight">
            {product.name}
          </h3>
        </div>
        
        <p className="text-xs text-slate-500 line-clamp-3 mb-3 flex-grow">
          {product.description}
        </p>
        
        <div className="mt-auto">
            <div className="flex justify-between items-center mb-3">
                <span className="text-lg font-bold text-slate-900">{product.price}</span>
                {product.source && <span className="text-xs text-slate-400 font-medium">{product.source}</span>}
            </div>
            
            <a 
            href={product.link} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
            Ver en Tienda
            </a>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;