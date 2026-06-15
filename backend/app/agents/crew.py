from __future__ import annotations

from app.core.config import settings

try:
    from crewai import Agent, Task, Crew, Process
    _crewai_available = True
except ImportError:
    _crewai_available = False


if _crewai_available:
    researcher = Agent(
        role="Technical Researcher",
        goal="Deeply analyze GitHub repositories and extract key technical insights, "
             "architecture patterns, and implementation details.",
        backstory="You are a seasoned software engineer who excels at reading and "
                  "understanding complex codebases. You can quickly identify the core "
                  "architecture, design patterns, and interesting implementation details "
                  "in any GitHub repository.",
        verbose=True,
        allow_delegation=False,
        llm=f"openai/{settings.crewai_model}",
    )

    writer = Agent(
        role="Technical Writer",
        goal="Transform raw technical analysis into engaging, well-structured book chapters "
             "that are accessible to intermediate developers.",
        backstory="You are a technical book author who specializes in making complex "
                  "software concepts approachable. You know how to structure content, "
                  "add practical examples, and maintain a consistent narrative voice.",
        verbose=True,
        allow_delegation=False,
        llm=f"openai/{settings.crewai_model}",
    )

    reviewer = Agent(
        role="Technical Reviewer",
        goal="Review and improve book chapters for technical accuracy, clarity, and "
             "educational value.",
        backstory="You are a senior engineer and editor who ensures all technical content "
                  "is correct, well-explained, and valuable for the target audience. "
                  "You catch errors, suggest improvements, and maintain quality standards.",
        verbose=True,
        allow_delegation=False,
        llm=f"openai/{settings.crewai_model}",
    )


def _build_crew(repo_name: str, repo_description: str, readme_content: str) -> Crew:
    if not _crewai_available:
        raise RuntimeError("crewai not installed")

    analysis_task = Task(
        description=(
            f"Analyze the GitHub repository '{repo_name}'.\n\n"
            f"Description: {repo_description}\n\n"
            f"README content (first 4000 chars):\n{readme_content[:4000]}\n\n"
            "Provide a structured analysis covering:\n"
            "1. Core purpose and problem solved\n"
            "2. Architecture and design patterns used\n"
            "3. Key technical concepts demonstrated\n"
            "4. Notable implementation details\n"
            "5. What makes this project interesting or educational"
        ),
        expected_output="A structured technical analysis with clear sections and concrete examples.",
        agent=researcher,
    )

    writing_task = Task(
        description=(
            "Based on the technical analysis provided by the researcher, write a "
            "well-structured book chapter about this repository.\n\n"
            "The chapter should:\n"
            "- Have a compelling title and introduction\n"
            "- Explain the problem the project solves\n"
            "- Walk through the architecture with clear explanations\n"
            "- Include code snippets or patterns worth learning\n"
            "- End with key takeaways and further reading suggestions\n"
            "- Be written in a clear, engaging style for intermediate developers"
        ),
        expected_output="A complete book chapter in markdown format, 1500-3000 words.",
        agent=writer,
    )

    review_task = Task(
        description=(
            "Review the written chapter for:\n"
            "1. Technical accuracy — are any claims or explanations wrong?\n"
            "2. Clarity — would an intermediate developer understand this?\n"
            "3. Completeness — are there important aspects missing?\n"
            "4. Quality — is the writing engaging and well-structured?\n\n"
            "Provide specific, actionable feedback. If the chapter needs revision, "
            "note exactly what should change."
        ),
        expected_output="A review summary with specific praise, issues found, and revision suggestions.",
        agent=reviewer,
    )

    return Crew(
        agents=[researcher, writer, reviewer],
        tasks=[analysis_task, writing_task, review_task],
        process=Process.sequential,
        verbose=True,
    )


async def generate_book_chapter(repo_name: str, repo_description: str, readme_content: str) -> dict:
    if not _crewai_available:
        return {"repo_name": repo_name, "output": "CrewAI not installed."}

    crew = _build_crew(repo_name, repo_description, readme_content)
    result = crew.kickoff()
    return {
        "repo_name": repo_name,
        "output": str(result),
    }
