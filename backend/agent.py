import os
import pandas as pd
import uuid
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
import volue_insight_timeseries as vit
from smolagents import CodeAgent, WebSearchTool, OpenAIModel, tool

# Load environment variables (Make sure .env is in the root folder)
load_dotenv()

# --- 1. SHARED VOLUE SESSION ---
def _make_session() -> Optional[vit.Session]:
    cid = os.environ.get("CLIENT_ID")
    sec = os.environ.get("CLIENT_SECRET")
    if not cid or not sec:
        print("WARNING: Missing CLIENT_ID / CLIENT_SECRET env vars.")
        return None
    try:
        # print("🔌 Connecting to Volue Insight...")
        return vit.Session(client_id=cid, client_secret=sec)
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return None

SESSION = _make_session()

# --- 2. TOOLS ---

@tool
def fetch_energy_data(curve_name: str, start_date: str, end_date: str) -> List[Dict[str, Any]]:
    """
    Retrieves historical (Time Series) data from Volue Insight for a date range.

    Args:
        curve_name: The technical name of the curve. Use "pri de spot €/mwh cet h a" for Electricity Germany Spot. Use "gas pri nl ttf da clo eex €/mwh cet d a" for Gas Netherlands TTF.
        start_date: Start date in 'YYYY-MM-DD' format (e.g., '2022-07-01').
        end_date: End date in 'YYYY-MM-DD' format (e.g., '2022-10-01').
    """
    if not SESSION:
        return [{"error": "Volue Session not initialized."}]

    try:
        curve = SESSION.get_curve(name=curve_name)
        
        # Convert strings to timestamps
        ts_from = pd.Timestamp(start_date)
        ts_to = pd.Timestamp(end_date)
        
        ts_data = curve.get_data(data_from=ts_from, data_to=ts_to)
        
        if ts_data is None:
             return []

        df = ts_data.to_pandas()
        
        # Ensure it is a DataFrame
        if isinstance(df, pd.Series):
            df = df.to_frame(name='value')
            
        # Reset index to get date column
        df.reset_index(inplace=True)
        df.columns = ['date', 'value']
        
        # Convert date to string for JSON serialization
        df['date'] = df['date'].dt.strftime('%Y-%m-%d %H:%M:%S')
        
        return df.to_dict(orient='records')

    except Exception as e:
        return [{"error": f"Error retrieving data: {str(e)}"}]

@tool
def final_answer(text_content: str, chart_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Provides the final answer to the user, with text and an optional chart.

    Args:
        text_content: The complete textual explanation of the answer.
        chart_data: A dictionary with chart data (keys 'type', 'data', etc.) or None if no chart is needed.
    """
    return {
        "text_content": text_content,
        "chart_data": chart_data
    }

# --- 3. AGENT MEMORY MANAGEMENT ---

# Simple in-memory storage for active conversations
AGENT_STORE: Dict[str, CodeAgent] = {}

# Ensure you have OPENAI_API_KEY in your .env file
_model = OpenAIModel(model_id="gpt-4.1-2025-04-14")

def _create_new_agent() -> CodeAgent:
    """Helper to spin up a fresh agent."""
    return CodeAgent(
        tools=[fetch_energy_data, final_answer, WebSearchTool()], 
        model=_model,
        add_base_tools=True,
        stream_outputs=False
    )

def get_or_create_agent(session_id: str) -> CodeAgent:
    """
    Retrieves an existing agent for this session_id or creates a new one.
    """
    if session_id not in AGENT_STORE:
        # print(f"✨ Creating new agent for session: {session_id}")
        AGENT_STORE[session_id] = _create_new_agent()
    # else:
        # print(f"🧠 Reusing agent memory for session: {session_id}")
    
    return AGENT_STORE[session_id]

def run_agent_logic(message: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Runs the agent. If session_id is provided, memory is preserved.
    Returns: The response dict AND the session_id.
    """
    # 1. Handle Session ID
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # 2. Get the specific agent instance for this user
    agent = get_or_create_agent(session_id)
    
    # 3. Run Agent (reset=False preserves memory!)
    try:
        response = agent.run(message, reset=False)
    except Exception as e:
        return {"text_content": f"Agent Error: {str(e)}", "chart_data": None, "session_id": session_id}
    
    # 4. Format Output
    output_data = {}
    if isinstance(response, dict):
        output_data = response
    else:
        output_data = {
            "text_content": str(response),
            "chart_data": None
        }
    
    output_data["session_id"] = session_id
    return output_data