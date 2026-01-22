import pytest
import pandas as pd
import math
from unittest.mock import MagicMock, patch
from agent import clean_for_json, final_answer, get_or_create_agent, AGENT_STORE

def test_clean_for_json_simple_values():
    """Test cleaning of individual float values."""
    assert clean_for_json(float('nan')) is None
    assert clean_for_json(float('inf')) is None
    assert clean_for_json(float('-inf')) is None
    assert clean_for_json(10.5) == 10.5

def test_clean_for_json_nested_structures():
    """Test cleaning of complex nested dictionaries and lists."""
    dirty_data = {
        "price": float('nan'),
        "history": [10.0, float('inf'), {"peak": float('-inf')}, 5.5],
        "meta": "valid_string"
    }
    expected = {
        "price": None,
        "history": [10.0, None, {"peak": None}, 5.5],
        "meta": "valid_string"
    }
    assert clean_for_json(dirty_data) == expected


def test_final_answer_tool():
    """Verify the final_answer tool returns the correct structure."""
    text = "The market is bullish."
    chart = {"type": "line", "data": [1, 2, 3]}
    result = final_answer(text_content=text, chart_data=chart)
    
    assert result["text_content"] == text
    assert result["chart_data"] == chart

@patch("agent.SESSION")
def test_fetch_energy_data_no_session(mock_session):
    """Test fetch_energy_data behavior when Volue session is missing."""
    import agent
    agent.SESSION = None
    from agent import fetch_energy_data
    
    result = fetch_energy_data("test_curve", "2026-01-01", "2026-01-02")
    assert "error" in result[0]
    assert result[0]["error"] == "Volue Session not initialized."


@patch("agent._create_new_agent")
def test_get_or_create_agent_persistence(mock_create):
    """Ensure AGENT_STORE persists agents across sessions."""
    AGENT_STORE.clear()
    mock_agent = MagicMock()
    mock_create.return_value = mock_agent
    
    session_id = "test-session-123"
    
    # First call creates
    agent1 = get_or_create_agent(session_id)
    assert mock_create.call_count == 1
    
    # Second call retrieves from store
    agent2 = get_or_create_agent(session_id)
    assert mock_create.call_count == 1
    assert agent1 == agent2


@patch("agent.get_or_create_agent")
def test_run_agent_logic_formatting(mock_get_agent):
    """Test the orchestration of the run_agent_logic function."""
    from agent import run_agent_logic
    
    mock_agent_instance = MagicMock()
    # Simulate agent returning a raw string instead of a dict
    mock_agent_instance.run.return_value = "Everything looks good."
    mock_get_agent.return_value = mock_agent_instance
    
    response = run_agent_logic("Hello", session_id="123")
    
    assert response["text_content"] == "Everything looks good."
    assert "session_id" in response
    assert response["session_id"] == "123"