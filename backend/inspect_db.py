
import chromadb
import os

# Define the path to the database
# Same path as in app/core/config.py
DB_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")

def inspect():
    print(f"--- CodeScope ChromaDB Inspector ---")
    print(f"Database Path: {DB_DIR}")

    if not os.path.exists(DB_DIR):
        print(f"Directory not found! Have you ingested a repository yet?")
        return

    try:
        # Initialize the client
        client = chromadb.PersistentClient(path=DB_DIR)
        
        # List all collections
        collections = client.list_collections()
        print(f"\nNumber of collections: {len(collections)}")
        
        for col in collections:
            print(f"\nCollection Name: {col.name}")
            count = col.count()
            print(f"Total Documents: {count}")
            
            if count > 0:
                print("\n--- First 3 Documents Preview ---")
                # Peek at the data (returns the first few results)
                data = col.peek(limit=3)
                
                # Check what keys are returned (usually ids, embeddings, metadatas, documents)
                ids = data['ids']
                metadatas = data['metadatas']
                documents = data['documents']
                
                for i in range(len(ids)):
                    print(f"\n[Document {i+1}]")
                    print(f"ID: {ids[i]}")
                    print(f"Metadata: {metadatas[i]}")
                    # Truncate content for display
                    content_preview = documents[i][:200].replace('\n', ' ') + "..." if documents[i] else "No content"
                    print(f"Content (First 200 chars): {content_preview}")
            else:
                print("Collection is empty.")
                
    except Exception as e:
        print(f"Error inspecting database: {e}")

if __name__ == "__main__":
    inspect()
