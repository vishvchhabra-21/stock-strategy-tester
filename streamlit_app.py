import os

import streamlit as st
import streamlit.components.v1 as components


APP_URL = os.environ.get("APP_URL", "").strip()

st.set_page_config(page_title="Stock Strategy Tester", layout="wide", initial_sidebar_state="collapsed")

st.markdown(
    """
    <style>
      #MainMenu {visibility: hidden;}
      header {visibility: hidden;}
      footer {visibility: hidden;}
      .block-container {padding-top: 0.5rem; padding-bottom: 0.5rem;}
      iframe {border: 0;}
    </style>
    """,
    unsafe_allow_html=True,
)

if not APP_URL:
    st.error("APP_URL is not set. Set it to your deployed web app URL (example: https://your-app.onrender.com).")
    st.stop()

components.iframe(APP_URL, height=1200, scrolling=True)

