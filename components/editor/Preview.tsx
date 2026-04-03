import { Code } from "bright";
import { MDXRemote } from "next-mdx-remote/rsc";
import React from "react";

Code.theme = {
  light: "github-light",
  dark: "github-dark",
  lightSelector: "html.light",
};

export const Preview = ({ content }: { content: string }) => {
  const formattedContent = content.replace(/\\/g, "").replace(/&#x20;/g, "");
  const renderPre = (props: React.HTMLAttributes<HTMLPreElement>) => {
    const children = React.Children.toArray(props.children);
    const hasRenderableCodeChild = children.some(
      (child) =>
        React.isValidElement(child) &&
        child.props &&
        typeof child.props === "object" &&
        "children" in child.props
    );

    if (!hasRenderableCodeChild) {
      return <pre {...props}>{props.children}</pre>;
    }

    return (
      <Code
        {...props}
        lineNumbers
        className="shadow-light-200 dark:shadow-dark-200"
      />
    );
  };

  return (
    <section className="markdown prose grid break-words">
      <MDXRemote
        source={formattedContent}
        components={{
          pre: renderPre,
        }}
      />
    </section>
  );
};
