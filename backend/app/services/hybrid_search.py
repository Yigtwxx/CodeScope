"""
Hybrid Search Service - Combines semantic and BM25 keyword search for better retrieval.
"""
from typing import List
from rank_bm25 import BM25Okapi
from langchain_core.documents import Document


class HybridSearcher:
    """Combines BM25 (keyword) and semantic (vector) search with weighted scoring."""
    
    def __init__(self, semantic_weight: float = 0.7, bm25_weight: float = 0.3):
        """
        Initialize hybrid searcher.
        
        Args:
            semantic_weight: Weight for semantic search results (0-1)
            bm25_weight: Weight for BM25 keyword results (0-1)
        """
        self.semantic_weight = semantic_weight
        self.bm25_weight = bm25_weight
        self.bm25_index = None
        self.documents = []
    
    def index_documents(self, documents: List[Document]):
        """
        Index documents for BM25 search.
        
        Args:
            documents: List of documents to index
        """
        self.documents = documents
        # Tokenize document content for BM25
        tokenized_corpus = [doc.page_content.lower().split() for doc in documents]
        self.bm25_index = BM25Okapi(tokenized_corpus)
    
    def search(self, query: str, vector_store, k: int = 8) -> List[Document]:
        """
        Perform hybrid search combining semantic and BM25 methods.
        
        Args:
            query: Search query
            vector_store: ChromaDB vector store for semantic search
            k: Number of results to return
        
        Returns:
            List of top-k documents ranked by combined score
        """
        # Get all documents from vector store for BM25 indexing
        all_docs_result = vector_store.get()
        
        if not all_docs_result or 'documents' not in all_docs_result:
            print("⚠️  No documents in vector store for hybrid search")
            return []
        
        # Reconstruct Document objects with metadata
        all_documents = []
        for i, (doc_text, metadata) in enumerate(zip(
            all_docs_result['documents'],
            all_docs_result['metadatas']
        )):
            all_documents.append(Document(
                page_content=doc_text,
                metadata=metadata or {}
            ))
        
        # Index documents for BM25 if not already indexed
        if self.bm25_index is None or len(self.documents) != len(all_documents):
            print(f"🔍 Indexing {len(all_documents)} documents for BM25...")
            self.index_documents(all_documents)
        
        # 1. Semantic Search (Vector similarity)
        semantic_results = vector_store.similarity_search_with_score(query, k=k*2)
        
        # 2. BM25 Keyword Search
        tokenized_query = query.lower().split()
        bm25_scores = self.bm25_index.get_scores(tokenized_query)
        
        # Normalize scores to 0-1 range
        max_bm25_score = max(bm25_scores) if max(bm25_scores) > 0 else 1
        normalized_bm25_scores = [score / max_bm25_score for score in bm25_scores]
        
        # Create BM25 results
        bm25_results = [
            (self.documents[i], normalized_bm25_scores[i])
            for i in range(len(self.documents))
        ]
        bm25_results.sort(key=lambda x: x[1], reverse=True)
        bm25_results = bm25_results[:k*2]
        
        # 3. Combine results with weighted scoring
        combined_scores = {}
        
        # Add semantic scores
        for doc, distance in semantic_results:
            # Convert distance to similarity (lower distance = higher similarity)
            similarity = 1 / (1 + distance)
            doc_id = id(doc)
            combined_scores[doc_id] = {
                'doc': doc,
                'score': similarity * self.semantic_weight,
                'semantic': similarity,
                'bm25': 0
            }
        
        # Add BM25 scores
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
        
        # Sort by combined score
        ranked_results = sorted(
            combined_scores.values(),
            key=lambda x: x['score'],
            reverse=True
        )
        
        # Debug output
        print(f"🔎 Hybrid Search Results (top {k}):")
        for i, result in enumerate(ranked_results[:k], 1):
            print(f"   {i}. Score: {result['score']:.3f} "
                  f"(Semantic: {result['semantic']:.3f}, BM25: {result['bm25']:.3f}) "
                  f"- {result['doc'].metadata.get('filename', 'Unknown')}")
        
        # Return top-k documents
        return [result['doc'] for result in ranked_results[:k]]


# Global instance
_hybrid_searcher = None

def get_hybrid_searcher() -> HybridSearcher:
    """Get or create global hybrid searcher instance."""
    global _hybrid_searcher
    if _hybrid_searcher is None:
        _hybrid_searcher = HybridSearcher(
            semantic_weight=0.7,  # 70% semantic
            bm25_weight=0.3       # 30% keyword
        )
    return _hybrid_searcher


def hybrid_search(query: str, vector_store, k: int = 8) -> List[Document]:
    """
    Convenience function for hybrid search.
    
    Args:
        query: Search query
        vector_store: ChromaDB vector store
        k: Number of results to return
    
    Returns:
        List of top-k documents
    """
    searcher = get_hybrid_searcher()
    return searcher.search(query, vector_store, k=k)
