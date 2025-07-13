# AI-Powered Document Chat Application(RAG based chatbot)

This is a Flask-based web application that enables users to have intelligent conversations with their documents using advanced AI technologies. The application combines document processing, vector storage, and large language models to provide an interactive chat experience with uploaded documents.

## Features

- Document Upload Support (PDF and TXT files)
- AI-powered document analysis and chat
- Vector-based document storage using ChromaDB
- Conversation memory using Redis
- Multiple AI model integration (Groq AI, Google Generative AI)
- Web-based user interface

## Tech Stack

- **Backend Framework**: Flask
- **AI/ML Components**:
  - Groq AI for LLM processing
  - Google Generative AI for embeddings
  - LangChain for document processing and chain management
- **Storage**:
  - ChromaDB for vector storage
  - Redis for chat history
- **Frontend**:
  - HTML/CSS/JavaScript
  - Static file serving

## Prerequisites

- Python 3.11+
- Redis server
- Required API keys:
  - Groq API key
  - Google API key

## Installation

1. Clone the repository
2. Create a virtual environment:
```bash
python -m venv intern
source intern/bin/activate  # On Windows: .\intern\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file with the following variables:
```env
FLASK_SECRET_KEY=your_secret_key
GROQ_API_KEY=your_groq_api_key
GOOGLE_API_KEY=your_google_api_key
REDIS_URL=your_redis_url
REDIS_PASSWORD=your_redis_password
```

## Project Structure

```
├── app.py              # Main Flask application
├── requirements.txt    # Python dependencies
├── static/            # Static files
│   ├── script.js      # Frontend JavaScript
│   └── styles.css     # CSS styles
├── templates/         # HTML templates
│   └── index.html     # Main application page
├── uploads/          # Document upload directory
└── chroma_db/        # Vector database storage
```

## Usage

1. Start the Flask application:
```bash
python app.py
```

2. Open your web browser and navigate to `http://localhost:5000`

3. Upload your documents (PDF or TXT files)

4. Start chatting with your documents!

## Features in Detail

- **Document Processing**: Supports PDF and TXT files up to 16MB
- **Intelligent Chunking**: Uses RecursiveCharacterTextSplitter for optimal document segmentation
- **Vector Search**: Utilizes ChromaDB for efficient similarity search
- **Conversation Memory**: Maintains chat history using Redis
- **Security Features**: 
  - File type validation
  - Maximum file size limit
  - Secure filename handling

## Security Considerations

- Maximum file size is limited to 16MB
- Only PDF and TXT files are allowed
- Implements secure filename handling
- Uses environment variables for sensitive data

## Contributing

Feel free to submit issues and enhancement requests!


