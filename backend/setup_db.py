from tasks.models import TaskDocument, UserDocument
from tasks import mongodb  # registers connection

def setup_database():
    print("🚀 Optimizing Database Query Performance using MongoEngine ORM...")
    
    # MongoEngine creates indexes automatically based on the 'meta' dict in models.py.
    # But we can call ensure_indexes() to be sure.
    
    TaskDocument.ensure_indexes()
    print("✅ Verified indexes for 'tasks' collection (user_id and created_at).")

    UserDocument.ensure_indexes()
    print("✅ Verified unique index on 'email' in 'users' collection.")

    print("\n🎉 Database optimization complete!")

if __name__ == "__main__":
    setup_database()
