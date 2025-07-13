from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from dotenv import load_dotenv
import os
import time
import tempfile
from pathlib import Path
import shutil
from werkzeug.utils import secure_filename

# Groq AI for LLM
from groq import Groq

# LangChain components
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from langchain.chains import create_retrieval_chain
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# ChromaDB for vector storage
from langchain_chroma import Chroma

# Redis for chat memory
from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain.memory import ConversationBufferMemory

import redis

# Load environment variables
load_dotenv()

# Flask app setup
app = Flask(__name__)
CORS(app)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'your_default_secret_key')  # For session management

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'txt'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# API keys and Redis config
groq_api_key = os.getenv('GROQ_API_KEY')
google_api_key = os.getenv('GOOGLE_API_KEY')
redis_url = os.getenv('REDIS_URL')
redis_password = os.getenv('REDIS_PASSWORD')

# Initialize Groq client
groq_client = Groq(api_key=groq_api_key)

# Redis client (optional direct connection for health checks)
redis_client = redis.Redis.from_url(redis_url, password=redis_password)

# Global variables for document processing
document_store = None
embeddings = None
text_splitter = None

def initialize_components():
    """Initialize embeddings and text splitter"""
    global embeddings, text_splitter

    if embeddings is None:
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/embedding-001",
            google_api_key=google_api_key
        )

    if text_splitter is None:
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len
        )

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def load_documents_from_directory(directory_path):
    """Load documents from uploaded files"""
    documents = []
    for file_path in Path(directory_path).glob('*'):
        if file_path.suffix.lower() == '.pdf':
            loader = PyPDFLoader(str(file_path))
            docs = loader.load()
            documents.extend(docs)
        elif file_path.suffix.lower() == '.txt':
            loader = TextLoader(str(file_path), encoding='utf-8')
            docs = loader.load()
            documents.extend(docs)
    return documents

def process_documents():
    """Process uploaded documents and create vector store"""
    global document_store
    initialize_components()
    documents = load_documents_from_directory(UPLOAD_FOLDER)
    if not documents:
        return False
    final_documents = text_splitter.split_documents(documents)
    persist_directory = "./chroma_db"
    if os.path.exists(persist_directory):
        shutil.rmtree(persist_directory)
    document_store = Chroma.from_documents(
        documents=final_documents,
        embedding=embeddings,
        persist_directory=persist_directory,
        collection_name="rag_collection"
    )
    return True

def get_memory(session_id):
    """Get or create conversation memory for a session using Redis"""
    return ConversationBufferMemory(
        chat_memory=RedisChatMessageHistory(
            url=redis_url,
            session_id=session_id
        ),
        return_messages=True,
        memory_key="chat_history"
    )

def get_groq_response(prompt, context, chat_history=None):
    """Get response from Groq AI, optionally with chat history"""
    try:
        history_text = ""
        if chat_history:
            for msg in chat_history:
                sender = "User" if msg.type == "human" else "AI"
                history_text += f"{sender}: {msg.content}\n"

        formatted_prompt = f"""
{history_text}
Answer the question based on the provided context only.
Please provide the most accurate response based on the question.

Context:
{context}

Question: {prompt}

Answer:
"""
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": formatted_prompt,
                }
            ],
            model="llama-3.3-70b-versatile",  # Or "mixtral-8x7b-32768" / "gemma-7b-it"
            temperature=0.1,
            max_tokens=512,
            top_p=0.9,
            stream=False,
            stop=None,
        )
        return chat_completion.choices[0].message.content.strip()
    except Exception as e:
        return f"Error generating response: {str(e)}"

def retrieve_documents(input_prompt):
    """Retrieve relevant documents and generate response"""
    global document_store
    if document_store is None:
        return {
            'answer': 'No documents uploaded yet. Please upload documents first.',
            'response_time': 0,
            'context': []
        }
    start_time = time.process_time()
    try:
        retriever = document_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 4}
        )
        relevant_docs = retriever.invoke(input_prompt)
        context = "\n\n".join([doc.page_content for doc in relevant_docs])
        response_time = time.process_time() - start_time
        return {
            'context': [doc.page_content for doc in relevant_docs],
            'context_str': context,
            'response_time': response_time
        }
    except Exception as e:
        return {
            'answer': f'Error processing query: {str(e)}',
            'response_time': 0,
            'context': []
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_files():
    """Handle file uploads"""
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    files = request.files.getlist('files')
    if not files or all(file.filename == '' for file in files):
        return jsonify({'error': 'No files selected'}), 400
    for file in os.listdir(UPLOAD_FOLDER):
        os.remove(os.path.join(UPLOAD_FOLDER, file))
    uploaded_files = []
    for file in files:
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(file_path)
            uploaded_files.append(filename)
    if not uploaded_files:
        return jsonify({'error': 'No valid files uploaded'}), 400
    success = process_documents()
    if success:
        return jsonify({
            'message': f'Successfully uploaded and processed {len(uploaded_files)} files',
            'files': uploaded_files
        })
    else:
        return jsonify({'error': 'Failed to process documents'}), 500

@app.route('/chat', methods=['POST'])
def chat():
    """Handle chat queries with persistent memory"""
    data = request.get_json()
    input_prompt = data.get('message', '')
    if not input_prompt:
        return jsonify({'error': 'No message provided'}), 400

    # Use Flask session or fallback to IP address for session ID
    session_id = session.get('session_id')
    if not session_id:
        session_id = request.remote_addr or os.urandom(8).hex()
        session['session_id'] = session_id

    memory = get_memory(session_id)
    chat_history = memory.load_memory_variables({}).get("chat_history", [])

    # Store user message
    memory.chat_memory.add_user_message(input_prompt)

    # Retrieve docs and context
    doc_response = retrieve_documents(input_prompt)
    if 'answer' in doc_response:
        # Error occurred during doc retrieval
        return jsonify({
            'answer': doc_response['answer'],
            'response_time': doc_response['response_time'],
            'context': doc_response['context'],
            'chat_history': [m.content for m in chat_history]
        })

    # Get LLM answer
    answer = get_groq_response(
        input_prompt, 
        doc_response['context_str'], 
        chat_history=chat_history
    )

    # Store AI response
    memory.chat_memory.add_ai_message(answer)

    # Reload updated chat history
    updated_chat_history = memory.load_memory_variables({}).get("chat_history", [])

    return jsonify({
        'answer': answer,
        'response_time': doc_response['response_time'],
        'context': doc_response['context'],
        'chat_history': [m.content for m in updated_chat_history]
    })

@app.route('/status', methods=['GET'])
def status():
    """Check if documents are loaded and Redis is healthy"""
    global document_store
    try:
        redis_ok = redis_client.ping()
    except Exception:
        redis_ok = False
    return jsonify({
        'documents_loaded': document_store is not None,
        'redis_connected': redis_ok,
        'upload_folder': UPLOAD_FOLDER,
        'allowed_extensions': list(ALLOWED_EXTENSIONS)
    })

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)
