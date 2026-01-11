"""
Hibrit Arama Servisi - Daha iyi sonuçlar için anlamsal (semantic) ve BM25 anahtar kelime aramasını birleştirir.
"""
from typing import List
from rank_bm25 import BM25Okapi
from langchain_core.documents import Document


class HybridSearcher:
    """Ağırlıklı puanlama ile BM25 (anahtar kelime) ve anlamsal (vektör) aramayı birleştirir."""
    
    def __init__(self, semantic_weight: float = 0.7, bm25_weight: float = 0.3):
        """
        Hibrit arayıcıyı başlat.
        
        Args:
            semantic_weight: Anlamsal arama sonuçları için ağırlık (0-1)
            bm25_weight: BM25 anahtar kelime sonuçları için ağırlık (0-1)
        """
        self.semantic_weight = semantic_weight
        self.bm25_weight = bm25_weight
        self.bm25_index = None
        self.documents = []
    
    def index_documents(self, documents: List[Document]):
        """
        Belgeleri BM25 araması için indeksler.
        
        Args:
            documents: İndekslenecek belgeler listesi
        """
        self.documents = documents
        # Belge içeriğini BM25 için token'lara ayır (tokenize et)
        tokenized_corpus = [doc.page_content.lower().split() for doc in documents]
        self.bm25_index = BM25Okapi(tokenized_corpus)
    
    def search(self, query: str, vector_store, k: int = 8) -> List[Document]:
        """
        Anlamsal ve BM25 yöntemlerini birleştirerek hibrit arama gerçekleştirir.
        
        Args:
            query: Arama sorgusu
            vector_store: Anlamsal arama için ChromaDB vektör deposu
            k: Döndürülecek sonuç sayısı
        
        Returns:
            Birleştirilmiş puana göre sıralanmış en iyi k belge
        """
        # Vektör deposundan tüm belgeleri al (BM25 indeksi için)
        all_docs_result = vector_store.get()
        
        if not all_docs_result or 'documents' not in all_docs_result:
            print("⚠️  No documents in vector store for hybrid search")
            return []
        
        # Metadata ile Document nesnelerini yeniden oluştur
        all_documents = []
        for i, (doc_text, metadata) in enumerate(zip(
            all_docs_result['documents'],
            all_docs_result['metadatas']
        )):
            all_documents.append(Document(
                page_content=doc_text,
                metadata=metadata or {}
            ))
        
        # Belgeler henüz indekslenmemişse veya sayı değişmişse BM25 için indeksle
        if self.bm25_index is None or len(self.documents) != len(all_documents):
            print(f"🔍 Indexing {len(all_documents)} documents for BM25...")
            self.index_documents(all_documents)
        
        # 1. Anlamsal Arama (Vektör benzerliği)
        semantic_results = vector_store.similarity_search_with_score(query, k=k*2)
        
        # 2. BM25 Anahtar Kelime Araması
        tokenized_query = query.lower().split()
        bm25_scores = self.bm25_index.get_scores(tokenized_query)
        
        # Puanları 0-1 aralığına normalize et
        max_bm25_score = max(bm25_scores) if max(bm25_scores) > 0 else 1
        normalized_bm25_scores = [score / max_bm25_score for score in bm25_scores]
        
        # BM25 sonuçlarını oluştur
        bm25_results = [
            (self.documents[i], normalized_bm25_scores[i])
            for i in range(len(self.documents))
        ]
        bm25_results.sort(key=lambda x: x[1], reverse=True)
        bm25_results = bm25_results[:k*2]
        
        # 3. Sonuçları ağırlıklı puanlama ile birleştir
        combined_scores = {}
        
        # Anlamsal puanları ekle
        for doc, distance in semantic_results:
            # Mesafeyi benzerliğe çevir (düşük mesafe = yüksek benzerlik)
            similarity = 1 / (1 + distance)
            doc_id = id(doc)
            combined_scores[doc_id] = {
                'doc': doc,
                'score': similarity * self.semantic_weight,
                'semantic': similarity,
                'bm25': 0
            }
        
        # BM25 puanlarını ekle
        for doc, bm25_score in bm25_results:
            doc_id = id(doc)
            if doc_id in combined_scores:
                combined_scores[doc_id]['score'] += bm25_score * self.bm25_weight
                combined_scores[doc_id]['bm25'] = bm25_score
            else:
                combined_scores[doc_id] = {
                    'doc': doc,
                    'score': bm25_score * self.bm25_weight,
                    'semantic': 0,
                    'bm25': bm25_score
                }
        
        # Birleştirilmiş puana göre sırala
        ranked_results = sorted(
            combined_scores.values(),
            key=lambda x: x['score'],
            reverse=True
        )
        
        # Hata ayıklama çıktısı
        print(f"🔎 Hybrid Search Results (top {k}):")
        for i, result in enumerate(ranked_results[:k], 1):
            print(f"   {i}. Score: {result['score']:.3f} "
                  f"(Semantic: {result['semantic']:.3f}, BM25: {result['bm25']:.3f}) "
                  f"- {result['doc'].metadata.get('filename', 'Unknown')}")
        
        # En iyi k belgeyi döndür
        return [result['doc'] for result in ranked_results[:k]]


# Global örnek (Singleton pattern benzeri)
_hybrid_searcher = None

def get_hybrid_searcher() -> HybridSearcher:
    """Global hibrit arayıcı örneğini getirir veya oluşturur."""
    global _hybrid_searcher
    if _hybrid_searcher is None:
        _hybrid_searcher = HybridSearcher(
            semantic_weight=0.7,  # %70 anlamsal
            bm25_weight=0.3       # %30 anahtar kelime
        )
    return _hybrid_searcher


def hybrid_search(query: str, vector_store, k: int = 8) -> List[Document]:
    """
    Hibrit arama için kolaylaştırıcı (wrapper) fonksiyon.
    
    Args:
        query: Arama sorgusu
        vector_store: ChromaDB vektör deposu
        k: Döndürülecek sonuç sayısı
    
    Returns:
        En iyi k belgenin listesi
    """
    searcher = get_hybrid_searcher()
    return searcher.search(query, vector_store, k=k)

